import { z } from 'zod'
import { spec } from './common'

/**
 * The verdict on one checklist question.
 *
 * `clientQuestion` is the deliverable. A gap report that says "requirements
 * around data residency are unclear" is an observation; a gap report that hands
 * the consultant a sentence they can paste into an email is work done.
 */
export const GapResult = z.object({
  questionId: z.string().min(1),
  /** Reasoning first, so the status is reached rather than justified. */
  evidenceSummary: z.string(),
  evidenceIds: z.array(z.string()),
  status: z.enum(['COVERED', 'PARTIAL', 'MISSING']),
  /** Null only when status is COVERED. */
  clientQuestion: z.string().nullable(),
})
export type GapResult = z.infer<typeof GapResult>

export const GapsOut = z.object({ results: z.array(GapResult) })
export type GapsOut = z.infer<typeof GapsOut>
export const GAPS_SPEC = spec('gap_assessment', GapsOut)

/** Enriched for the UI with the question text and dimension from the ontology. */
export type GapRow = GapResult & {
  dimension: string
  question: string
  whyItMatters: string
}
