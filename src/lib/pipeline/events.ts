import type { TraceEntry } from '../llm/types'
import type { Violation } from '../verify/types'

export const STAGES = [
  'ingest',
  'segment',
  'extract',
  'reconcile',
  'gaps',
  'synthesize',
  'blueprint',
  'poc',
] as const
export type Stage = (typeof STAGES)[number]

export const STAGE_LABEL: Record<Stage, string> = {
  ingest: 'Reading sources',
  segment: 'Building evidence base',
  extract: 'Extracting signals',
  reconcile: 'Reconciling across sources',
  gaps: 'Scoring discovery coverage',
  synthesize: 'Writing the brief',
  blueprint: 'Designing the better process',
  poc: 'Generating the POC',
}

export type RunEvent =
  | { t: 'stage'; stage: Stage; status: 'START' | 'DONE' | 'FAIL'; detail?: string }
  | { t: 'progress'; stage: Stage; done: number; total: number; label: string }
  | { t: 'attempt'; stage: Stage; attempt: number; violations?: Violation[]; because?: string }
  | { t: 'trace'; entry: TraceEntry }
  | { t: 'note'; stage: Stage; text: string }
  | { t: 'done'; runId: string; needsHumanReview: string[] }
  | { t: 'error'; message: string }

export type EventFn = (e: RunEvent) => void

/**
 * Bounded-concurrency map.
 *
 * Sources are independent, so extraction fans out — but not without a cap.
 * Uncapped, a 40-source engagement opens 40 connections and hits a rate limit
 * mid-run, which surfaces as a partial brief rather than as an error anyone
 * notices.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0

  const worker = async () => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      results[i] = await fn(items[i], i)
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
  return results
}
