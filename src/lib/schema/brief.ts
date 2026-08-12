import { z } from 'zod'
import { Citation, spec } from './common'
import { Confidence } from './signals'

/**
 * The Discovery Brief — what a consultant would write after reading everything.
 *
 * Every element that asserts something about the client carries a Citation.
 * That is not decoration: the Tier-1 validators walk this structure looking for
 * exactly those fields, so a claim without one cannot reach the UI.
 */

const Cited = <T extends z.ZodRawShape>(shape: T) => z.object({ ...shape, citation: Citation })

export const ProcessStep = Cited({
  step: z.number().int().min(1),
  name: z.string().min(3),
  actor: z.string().min(2),
  detail: z.string(),
  /** Where the work waits. Drives the to-be disposition in the blueprint. */
  isBottleneck: z.boolean(),
})
export type ProcessStep = z.infer<typeof ProcessStep>

export const PainPoint = Cited({
  id: z.string().min(1),
  statement: z.string().min(5),
  impact: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  /** Who feels it. A pain nobody owns never gets funded. */
  affects: z.string(),
  confidence: Confidence,
})
export type PainPoint = z.infer<typeof PainPoint>

export const Requirement = Cited({
  id: z.string().min(1),
  statement: z.string().min(5),
  moscow: z.enum(['MUST', 'SHOULD', 'COULD', 'WONT']),
  rationale: z.string(),
  confidence: Confidence,
})
export type Requirement = z.infer<typeof Requirement>

export const Brief = z.object({
  /** One paragraph a partner could read aloud to the client. */
  executiveSummary: z.string().min(50),
  goal: Cited({ statement: z.string().min(10) }),
  currentProcess: z.array(ProcessStep),
  painPoints: z.array(PainPoint),
  requirements: z.array(Requirement),
  constraints: z.array(Cited({ id: z.string().min(1), statement: z.string().min(5) })),
  stakeholders: z.array(Cited({ name: z.string().min(1), role: z.string().min(2) })),
  systems: z.array(Cited({ name: z.string().min(1), role: z.string() })),
  openQuestions: z.array(
    z.object({
      id: z.string().min(1),
      question: z.string().min(10),
      why: z.string().min(5),
      /** Set when this question exists because two sources disagree. */
      raisedByConflictId: z.string().nullable(),
    }),
  ),
})
export type Brief = z.infer<typeof Brief>
export const BRIEF_SPEC = spec('discovery_brief', Brief)
