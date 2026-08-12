import { config } from '../config'
import { AnthropicClient } from './anthropic'
import { OpenAiClient, type TraceSink } from './openai'
import type { CallResult, CompleteArgs, LlmClient, TranscribeResult } from './types'

export * from './types'
export type { TraceSink }

export class MissingKeyError extends Error {
  constructor() {
    super(
      'No API key configured. Copy .env.example to .env and set OPENAI_API_KEY, ' +
        'or explore the committed demo run, which needs no key.',
    )
    this.name = 'MissingKeyError'
  }
}

/**
 * Routes chat to the configured provider, but always routes audio and
 * embeddings to OpenAI — Anthropic offers neither, and a mixed run is better
 * than a broken one. This is the only place in the codebase that knows a
 * provider exists.
 */
class RoutingClient implements LlmClient {
  readonly supportsVision: boolean
  readonly supportsAudio: boolean

  constructor(
    private chat: LlmClient,
    private openaiFallback: OpenAiClient | null,
  ) {
    this.supportsVision = chat.supportsVision
    this.supportsAudio = chat.supportsAudio || openaiFallback !== null
  }

  complete<T>(args: CompleteArgs<T>): Promise<CallResult<T>> {
    return this.chat.complete(args)
  }

  transcribe(args: Parameters<LlmClient['transcribe']>[0]): Promise<CallResult<TranscribeResult>> {
    const c = this.chat.supportsAudio ? this.chat : this.openaiFallback
    if (!c) throw new Error('Audio ingestion needs OPENAI_API_KEY set, even under LLM_PROVIDER=anthropic.')
    return c.transcribe(args)
  }

  embed(args: Parameters<LlmClient['embed']>[0]): Promise<CallResult<number[][]>> {
    const c = this.chat instanceof OpenAiClient ? this.chat : this.openaiFallback
    if (!c) throw new Error('Reconciliation needs OPENAI_API_KEY set for embeddings.')
    return c.embed(args)
  }
}

/**
 * @param onTrace called for every LLM call including failures and retries.
 *        The pipeline passes a sink that both persists the row and pushes it
 *        down the SSE stream, which is how the UI shows the loop working.
 */
export function getLlm(onTrace: TraceSink = () => {}): LlmClient {
  const openai = config.openaiKey ? new OpenAiClient(config.openaiKey, onTrace) : null

  if (config.provider === 'anthropic') {
    if (!config.anthropicKey) throw new MissingKeyError()
    return new RoutingClient(new AnthropicClient(config.anthropicKey, onTrace), openai)
  }

  if (!openai) throw new MissingKeyError()
  return openai
}

export { OpenAiClient, AnthropicClient }
