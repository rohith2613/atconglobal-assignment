import OpenAI from 'openai'
import { config, costOf, AUDIO_PRICE_PER_MINUTE_USD } from '../config'
import {
  type CallResult,
  type CompleteArgs,
  type LlmClient,
  type TraceEntry,
  type TranscribeResult,
  SchemaViolationError,
  TruncationError,
} from './types'

const MAX_OUTPUT_TOKENS = 16_000

let counter = 0
function traceId(): string {
  counter += 1
  return `tr_${Date.now().toString(36)}_${counter.toString(36)}`
}

export type TraceSink = (entry: TraceEntry) => void

export class OpenAiClient implements LlmClient {
  readonly supportsVision = true
  readonly supportsAudio = true

  private client: OpenAI

  constructor(
    apiKey: string,
    private onTrace: TraceSink = () => {},
  ) {
    this.client = new OpenAI({ apiKey })
  }

  async complete<T>(args: CompleteArgs<T>): Promise<CallResult<T>> {
    const model = args.modelOverride ?? config.models[args.role]
    const attempt = args.attempt ?? 1
    const started = Date.now()

    const content: OpenAI.Chat.ChatCompletionContentPart[] = [{ type: 'text', text: args.user }]
    for (const url of args.images ?? []) {
      content.push({ type: 'image_url', image_url: { url, detail: 'high' } })
    }

    let response: OpenAI.Chat.ChatCompletion
    try {
      response = await this.client.chat.completions.create({
        model,
        max_completion_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          { role: 'system', content: args.system },
          { role: 'user', content },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: args.schema.name, schema: args.schema.json, strict: true },
        },
      })
    } catch (err) {
      this.fail(args, model, attempt, started, err)
      throw err
    }

    const choice = response.choices[0]

    // Truncation first: a cut-off JSON body that happens to parse is worse than
    // one that does not, because nothing downstream can tell it went wrong.
    if (choice?.finish_reason === 'length') {
      const e = new TruncationError(model, args.stage)
      this.fail(args, model, attempt, started, e, response)
      throw e
    }

    if (choice?.message.refusal) {
      const e = new Error(`Model refused during "${args.stage}": ${choice.message.refusal}`)
      this.fail(args, model, attempt, started, e, response)
      throw e
    }

    const raw = choice?.message.content ?? ''
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      const e = new SchemaViolationError(args.stage, `response was not JSON: ${raw.slice(0, 200)}`)
      this.fail(args, model, attempt, started, e, response)
      throw e
    }

    // Belt and braces: the API enforces the schema, we enforce it again in
    // process. Strict mode has gaps (refinements, min lengths) that Zod closes.
    const result = args.schema.zod.safeParse(parsed)
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ')
      const e = new SchemaViolationError(args.stage, issues)
      this.fail(args, model, attempt, started, e, response)
      throw e
    }

    const trace = this.entry(args, model, attempt, started, {
      ok: true,
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
    })
    this.onTrace(trace)
    return { data: result.data, trace }
  }

  async transcribe(args: {
    runId: string
    engagementId: string
    stage: string
    file: Buffer
    filename: string
  }): Promise<CallResult<TranscribeResult>> {
    const started = Date.now()
    const model = config.audioModel

    // The SDK wants a File; Node 20+ has one globally.
    const file = new File([new Uint8Array(args.file)], args.filename, { type: 'audio/mpeg' })

    const res = (await this.client.audio.transcriptions.create({
      file,
      model,
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    })) as unknown as {
      text: string
      duration?: number
      segments?: { start: number; end: number; text: string }[]
    }

    const durationMin = (res.duration ?? 0) / 60
    const trace: TraceEntry = {
      id: traceId(),
      runId: args.runId,
      engagementId: args.engagementId,
      stage: args.stage,
      role: 'audio',
      model,
      promptTokens: 0,
      completionTokens: 0,
      costUsd: durationMin * AUDIO_PRICE_PER_MINUTE_USD,
      latencyMs: Date.now() - started,
      attempt: 1,
      ok: true,
      summary: `transcribe ${args.filename} (${(res.duration ?? 0).toFixed(0)}s)`,
      createdAt: new Date().toISOString(),
    }
    this.onTrace(trace)

    return {
      data: {
        text: res.text,
        segments: (res.segments ?? []).map((s) => ({
          start: s.start,
          end: s.end,
          text: s.text.trim(),
        })),
      },
      trace,
    }
  }

  async embed(args: {
    runId: string
    engagementId: string
    stage: string
    texts: string[]
  }): Promise<CallResult<number[][]>> {
    const started = Date.now()
    const model = config.embedModel

    if (args.texts.length === 0) {
      const trace = this.simpleTrace(args, model, 'embed', 0, 0, started, '0 texts')
      this.onTrace(trace)
      return { data: [], trace }
    }

    const res = await this.client.embeddings.create({ model, input: args.texts })
    const promptTokens = res.usage?.prompt_tokens ?? 0
    const trace = this.simpleTrace(
      args,
      model,
      'embed',
      promptTokens,
      0,
      started,
      `${args.texts.length} texts`,
    )
    this.onTrace(trace)
    return { data: res.data.map((d) => d.embedding), trace }
  }

  // ---- trace helpers -------------------------------------------------------

  private simpleTrace(
    args: { runId: string; engagementId: string; stage: string },
    model: string,
    role: 'embed' | 'audio',
    promptTokens: number,
    completionTokens: number,
    started: number,
    summary: string,
  ): TraceEntry {
    return {
      id: traceId(),
      runId: args.runId,
      engagementId: args.engagementId,
      stage: args.stage,
      role,
      model,
      promptTokens,
      completionTokens,
      costUsd: costOf(model, promptTokens, completionTokens),
      latencyMs: Date.now() - started,
      attempt: 1,
      ok: true,
      summary,
      createdAt: new Date().toISOString(),
    }
  }

  private entry<T>(
    args: CompleteArgs<T>,
    model: string,
    attempt: number,
    started: number,
    o: { ok: boolean; promptTokens: number; completionTokens: number; error?: string },
  ): TraceEntry {
    return {
      id: traceId(),
      runId: args.runId,
      engagementId: args.engagementId,
      stage: args.stage,
      role: args.role,
      model,
      promptTokens: o.promptTokens,
      completionTokens: o.completionTokens,
      costUsd: costOf(model, o.promptTokens, o.completionTokens),
      latencyMs: Date.now() - started,
      attempt,
      ok: o.ok,
      error: o.error,
      summary: args.summary ?? `${args.stage} (${args.schema.name})`,
      createdAt: new Date().toISOString(),
    }
  }

  /** Failed calls are traced too — a run that cost money and produced nothing
   *  is exactly the thing you want visible. */
  private fail<T>(
    args: CompleteArgs<T>,
    model: string,
    attempt: number,
    started: number,
    err: unknown,
    response?: OpenAI.Chat.ChatCompletion,
  ): void {
    this.onTrace(
      this.entry(args, model, attempt, started, {
        ok: false,
        promptTokens: response?.usage?.prompt_tokens ?? 0,
        completionTokens: response?.usage?.completion_tokens ?? 0,
        error: err instanceof Error ? err.message : String(err),
      }),
    )
  }
}
