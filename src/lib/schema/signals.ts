import { z } from 'zod'
import { Citation, spec } from './common'

/**
 * The ten things worth pulling out of a discovery corpus.
 *
 * Kept deliberately small. A larger taxonomy sounds more thorough and produces
 * worse extraction — the model spends its attention deciding between
 * near-identical labels instead of reading what was said.
 */
export const SignalType = z.enum([
  'GOAL',
  'CURRENT_PROCESS_STEP',
  'PAIN_POINT',
  'REQUIREMENT',
  'CONSTRAINT',
  'STAKEHOLDER',
  'SYSTEM',
  'METRIC',
  'DECISION',
  'OPEN_QUESTION',
])
export type SignalType = z.infer<typeof SignalType>

export const Confidence = z.enum(['HIGH', 'MEDIUM', 'LOW'])
export type Confidence = z.infer<typeof Confidence>

export const Signal = z.object({
  id: z.string().min(1),
  type: SignalType,
  /** One sentence, in the client's own vocabulary. */
  statement: z.string().min(5),
  detail: z.string(),
  /** The subject this signal is about — used to group contradictions. */
  subject: z.string().min(2),
  citation: Citation,
  confidence: Confidence,
})
export type Signal = z.infer<typeof Signal>

export const SignalsOut = z.object({ signals: z.array(Signal) })
export type SignalsOut = z.infer<typeof SignalsOut>
export const SIGNALS_SPEC = spec('signals', SignalsOut)

/**
 * A contradiction between sources.
 *
 * This is the object the whole reconcile stage exists to produce. No single
 * document contains a contradiction — it only exists in the corpus as a whole,
 * which is exactly why a consultant reading files one at a time misses it.
 */
export const Conflict = z.object({
  id: z.string().min(1),
  subject: z.string().min(2),
  sideA: z.object({
    claim: z.string().min(3),
    evidenceIds: z.array(z.string()).min(1),
    quote: z.string().min(3),
    sourceLabel: z.string(),
  }),
  sideB: z.object({
    claim: z.string().min(3),
    evidenceIds: z.array(z.string()).min(1),
    quote: z.string().min(3),
    sourceLabel: z.string(),
  }),
  severity: z.enum(['BLOCKING', 'MATERIAL', 'MINOR']),
  whyItMatters: z.string().min(10),
  /** Written so a consultant can paste it into an email unedited. */
  resolutionQuestion: z.string().min(10),
})
export type Conflict = z.infer<typeof Conflict>

export const ConflictsOut = z.object({ conflicts: z.array(Conflict) })
export const CONFLICTS_SPEC = spec('conflicts', ConflictsOut)

/** Output of the dedup judge: which candidate pairs are genuinely the same claim. */
export const MergeOut = z.object({
  merges: z.array(
    z.object({
      keepId: z.string(),
      dropId: z.string(),
      reason: z.string(),
    }),
  ),
})
export const MERGE_SPEC = spec('merges', MergeOut)
