/**
 * Single source of truth for environment, model selection and pricing.
 *
 * Every model is one env var. The design intent is that the cheap model does
 * the volume work (extraction runs once per source, gap analysis five times per
 * run) and only synthesis — which reads everything and must not drop things —
 * gets the strong model. Being able to move that line without touching domain
 * code is the point.
 */

export type Role = 'router' | 'extractor' | 'synthesizer' | 'critic' | 'vision' | 'poc'

export const ROLES: readonly Role[] = ['router', 'extractor', 'synthesizer', 'critic', 'vision', 'poc']

function env(key: string, fallback: string): string {
  const v = process.env[key]
  return v && v.trim().length > 0 ? v.trim() : fallback
}

function envInt(key: string, fallback: number): number {
  const n = Number.parseInt(process.env[key] ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

const provider = env('LLM_PROVIDER', 'openai') === 'anthropic' ? 'anthropic' : 'openai'
const openaiKey = process.env.OPENAI_API_KEY?.trim() || undefined
const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim() || undefined

export const config = {
  provider,
  openaiKey,
  anthropicKey,

  models: {
    router: env('MODEL_ROUTER', 'gpt-4.1-mini'),
    extractor: env('MODEL_EXTRACTOR', 'gpt-4.1-mini'),
    synthesizer: env('MODEL_SYNTHESIZER', 'gpt-4.1'),
    critic: env('MODEL_CRITIC', 'gpt-4.1-mini'),
    vision: env('MODEL_VISION', 'gpt-4.1-mini'),
    poc: env('MODEL_POC', 'gpt-4.1'),
  } satisfies Record<Role, string>,

  audioModel: env('MODEL_AUDIO', 'whisper-1'),
  embedModel: env('MODEL_EMBED', 'text-embedding-3-small'),

  /**
   * Output ceiling per role, sized to what a correct answer actually needs.
   *
   * A single global ceiling was a mistake. Set low it truncated real answers;
   * set to the model maximum of 32k it let the POC stage generate for over ten
   * minutes before anything noticed — the failure never arrived, so the retry
   * that handles truncation never got the chance to fire. A ceiling near the
   * expected size converts a runaway into a fast, retryable truncation.
   */
  maxOutputTokens: {
    router: 4_000,
    extractor: 12_000,
    synthesizer: 20_000,
    critic: 4_000,
    vision: 4_000,
    poc: 10_000,
  } satisfies Record<Role, number>,

  /** Hard deadline per request. Nothing here should ever take three minutes. */
  requestTimeoutMs: envInt('REQUEST_TIMEOUT_MS', 180_000),

  concurrency: envInt('CONCURRENCY', 6),
  maxAttempts: envInt('MAX_ATTEMPTS', 3),

  dbPath: env('PRISM_DB', './data/prism.db'),

  /**
   * Whether a live run is possible. When false the app serves the committed
   * demo run instead of erroring, so a reviewer can see every screen without
   * spending anything.
   */
  get hasKey(): boolean {
    return provider === 'anthropic' ? Boolean(anthropicKey) : Boolean(openaiKey)
  },
}

/**
 * Published list prices in USD per million tokens, captured 2026-08-12.
 * Held here rather than fetched so cost figures in the run trace are
 * reproducible; a stale number is a one-line fix in one place.
 */
const PRICES: Record<string, { inPerM: number; outPerM: number }> = {
  'gpt-4.1': { inPerM: 2.0, outPerM: 8.0 },
  'gpt-4.1-mini': { inPerM: 0.4, outPerM: 1.6 },
  'gpt-4.1-nano': { inPerM: 0.1, outPerM: 0.4 },
  'gpt-4o': { inPerM: 2.5, outPerM: 10.0 },
  'gpt-4o-mini': { inPerM: 0.15, outPerM: 0.6 },
  'gpt-5': { inPerM: 1.25, outPerM: 10.0 },
  'gpt-5-mini': { inPerM: 0.25, outPerM: 2.0 },
  'gpt-5-nano': { inPerM: 0.05, outPerM: 0.4 },
  'text-embedding-3-small': { inPerM: 0.02, outPerM: 0 },
  'text-embedding-3-large': { inPerM: 0.13, outPerM: 0 },
  'claude-sonnet-5': { inPerM: 3.0, outPerM: 15.0 },
  'claude-haiku-4-5-20251001': { inPerM: 1.0, outPerM: 5.0 },
}

/**
 * Unknown models cost zero rather than throwing. A missing price should never
 * be able to fail a pipeline run — the trace is instrumentation, not control
 * flow. The UI surfaces zero-cost rows so an unpriced model is visible.
 */
export function priceFor(model: string): { inPerM: number; outPerM: number } {
  return PRICES[model] ?? { inPerM: 0, outPerM: 0 }
}

export function costOf(model: string, promptTokens: number, completionTokens: number): number {
  const p = priceFor(model)
  return (promptTokens / 1_000_000) * p.inPerM + (completionTokens / 1_000_000) * p.outPerM
}

/** whisper-1 is billed per minute of audio, not per token. */
export const AUDIO_PRICE_PER_MINUTE_USD = 0.006
