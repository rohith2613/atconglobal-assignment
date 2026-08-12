import { config, costOf } from '../config'
import {
  type CallResult,
  type CompleteArgs,
  type LlmClient,
  type TraceEntry,
  type TranscribeResult,
  SchemaViolationError,
  TruncationError,
} from './types'
import type { TraceSink } from './openai'

const API = 'https://api.anthropic.com/v1/messages'
const VERSION = '2023-06-01'
const MAX_OUTPUT_TOKENS = 16_000

let counter = 0
const traceId = () => `tr_${Date.now().toString(36)}_${(counter += 1).toString(36)}`

type AnthropicResponse = {
  content: { type: string; name?: string; input?: unknown }[]
  stop_reason: string
  usage: { input_tokens: number; output_tokens: number }
}

/**
 * Anthropic implementation of the same LlmClient contract.
 *
 * Structured output is obtained by declaring the target schema as a tool and
 * forcing a call to it — the Messages API's equivalent of OpenAI's strict
 * json_schema mode. Written with plain fetch rather than the SDK to avoid a
 * dependency for a path most installs never take.
 *
 * Honest limitation: no Anthropic key was available while building this, so
 * this adapter is written to the documented API but has not been exercised
 * against the live service. Audio and embeddings intentionally throw — the
 * factory routes those to OpenAI regardless of provider.
 */
export class AnthropicClient implements LlmClient {
  readonly supportsVision = true
  readonly supportsAudio = false

  constructor(
    private apiKey: string,
    private onTrace: TraceSink = () => {},
  ) {}

  async complete<T>(args: CompleteArgs<T>): Promise<CallResult<T>> {
    const model = args.modelOverride ?? config.models[args.role]
    const attempt = args.attempt ?? 1
    const started = Date.now()

    const content: unknown[] = [{ type: 'text', text: args.user }]
    for (const url of args.images ?? []) {
      const m = /^data:([^;]+);base64,(.*)$/.exec(url)
      if (m) {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: m[1], data: m[2] },
        })
      }
    }

    const res = await fetch(API, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: args.system,
        messages: [{ role: 'user', content }],
        tools: [
          {
            name: args.schema.name,
            description: `Return the ${args.schema.name} result.`,
            input_schema: args.schema.json,
          },
        ],
        tool_choice: { type: 'tool', name: args.schema.name },
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      const e = new Error(`Anthropic ${res.status} during "${args.stage}": ${body.slice(0, 300)}`)
      this.onTrace(this.entry(args, model, attempt, started, 0, 0, false, e.message))
      throw e
    }

    const json = (await res.json()) as AnthropicResponse
    const promptTokens = json.usage?.input_tokens ?? 0
    const completionTokens = json.usage?.output_tokens ?? 0

    if (json.stop_reason === 'max_tokens') {
      const e = new TruncationError(model, args.stage)
      this.onTrace(
        this.entry(args, model, attempt, started, promptTokens, completionTokens, false, e.message),
      )
      throw e
    }

    const toolUse = json.content.find((c) => c.type === 'tool_use')
    if (!toolUse) {
      const e = new SchemaViolationError(args.stage, 'model returned no tool_use block')
      this.onTrace(
        this.entry(args, model, attempt, started, promptTokens, completionTokens, false, e.message),
      )
      throw e
    }

    const parsed = args.schema.zod.safeParse(toolUse.input)
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ')
      const e = new SchemaViolationError(args.stage, issues)
      this.onTrace(
        this.entry(args, model, attempt, started, promptTokens, completionTokens, false, e.message),
      )
      throw e
    }

    const trace = this.entry(args, model, attempt, started, promptTokens, completionTokens, true)
    this.onTrace(trace)
    return { data: parsed.data, trace }
  }

  transcribe(): Promise<CallResult<TranscribeResult>> {
    throw new Error('AnthropicClient cannot transcribe audio; the factory routes audio to OpenAI.')
  }

  embed(): Promise<CallResult<number[][]>> {
    throw new Error('AnthropicClient has no embeddings API; the factory routes embeddings to OpenAI.')
  }

  private entry<T>(
    args: CompleteArgs<T>,
    model: string,
    attempt: number,
    started: number,
    promptTokens: number,
    completionTokens: number,
    ok: boolean,
    error?: string,
  ): TraceEntry {
    return {
      id: traceId(),
      runId: args.runId,
      engagementId: args.engagementId,
      stage: args.stage,
      role: args.role,
      model,
      promptTokens,
      completionTokens,
      costUsd: costOf(model, promptTokens, completionTokens),
      latencyMs: Date.now() - started,
      attempt,
      ok,
      error,
      summary: args.summary ?? `${args.stage} (${args.schema.name})`,
      createdAt: new Date().toISOString(),
    }
  }
}
