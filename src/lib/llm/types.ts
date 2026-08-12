import type { z } from 'zod'
import type { Role } from '../config'

export type { Role }

/**
 * One row of the run trace. Written for every LLM call, successful or not,
 * including every retry — which is what makes the loop visible in the UI
 * rather than something the README merely claims.
 */
export type TraceEntry = {
  id: string
  runId: string
  engagementId: string
  stage: string
  role: Role | 'audio' | 'embed'
  model: string
  promptTokens: number
  completionTokens: number
  costUsd: number
  latencyMs: number
  attempt: number
  ok: boolean
  error?: string
  /** Short human-readable note, e.g. "extract signals from transcript-kickoff.txt". */
  summary: string
  createdAt: string
}

export type CallResult<T> = { data: T; trace: TraceEntry }

export type JsonSchema = Record<string, unknown>

export type SchemaSpec<T> = {
  name: string
  zod: z.ZodType<T>
  json: JsonSchema
}

export type CompleteArgs<T> = {
  role: Role
  stage: string
  runId: string
  engagementId: string
  attempt?: number
  system: string
  user: string
  schema: SchemaSpec<T>
  /** data: URIs. Only honoured by roles pointed at a vision-capable model. */
  images?: string[]
  summary?: string
  /** Overrides the role's configured model for this one call. */
  modelOverride?: string
}

export type TranscribeResult = {
  text: string
  segments: { start: number; end: number; text: string }[]
}

export interface LlmClient {
  /**
   * Structured completion validated against `schema`. Throws TruncationError if
   * the model ran out of output budget — a truncated JSON body that happens to
   * parse is the most dangerous silent failure in this whole system, so it is
   * treated as an error and never returned as an answer.
   */
  complete<T>(args: CompleteArgs<T>): Promise<CallResult<T>>

  transcribe(args: {
    runId: string
    engagementId: string
    stage: string
    file: Buffer
    filename: string
  }): Promise<CallResult<TranscribeResult>>

  embed(args: {
    runId: string
    engagementId: string
    stage: string
    texts: string[]
  }): Promise<CallResult<number[][]>>

  /** True when this provider can accept images on the vision role. */
  readonly supportsVision: boolean
  /** True when this provider can transcribe audio natively. */
  readonly supportsAudio: boolean
}

export class TruncationError extends Error {
  constructor(model: string, stage: string) {
    super(
      `${model} hit its output limit during "${stage}". Treating a truncated ` +
        `response as an answer is how documents silently lose content, so this ` +
        `is an error. Reduce the batch size or raise max_tokens.`,
    )
    this.name = 'TruncationError'
  }
}

export class SchemaViolationError extends Error {
  constructor(
    public readonly stage: string,
    public readonly issues: string,
  ) {
    super(`Model output failed schema validation during "${stage}": ${issues}`)
    this.name = 'SchemaViolationError'
  }
}
