import { z } from 'zod'
import { spec } from './common'

/**
 * The proposed better way of working, and the application that supports it.
 *
 * The cross-references — resolvesPainIds, requirementIds, roleIds — are the
 * point. They are what the traceability matrix renders and what the Tier-1
 * validators check, so a feature nobody asked for and a pain point nothing
 * fixes both become visible instead of plausible.
 */

export const Disposition = z.enum(['KEEP', 'SIMPLIFY', 'AUTOMATE', 'ELIMINATE'])
export type Disposition = z.infer<typeof Disposition>

export const DISPOSITION_MEANING: Record<Disposition, string> = {
  KEEP: 'Works today. Leave it alone.',
  SIMPLIFY: 'Still needed, but with fewer hand-offs, fields or approvals.',
  AUTOMATE: 'No human judgement required. The system should do it.',
  ELIMINATE: 'The step exists only to compensate for a problem the new process removes.',
}

export const Blueprint = z.object({
  /** How the proposal differs from today, in two or three sentences. */
  summary: z.string().min(50),

  toBeProcess: z.array(
    z.object({
      step: z.number().int().min(1),
      name: z.string().min(3),
      actor: z.string().min(2),
      disposition: Disposition,
      rationale: z.string().min(10),
      /** Pain point ids from the brief that this step resolves. */
      resolvesPainIds: z.array(z.string()),
      /** The as-is step number this replaces, or null when newly introduced. */
      replacesAsIsStep: z.number().int().nullable(),
    }),
  ),

  features: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(3),
      description: z.string().min(10),
      /** Requirement ids from the brief. A feature tracing to none is an ORPHAN_FEATURE. */
      requirementIds: z.array(z.string()).min(1),
      priority: z.enum(['P0', 'P1', 'P2']),
      effort: z.enum(['S', 'M', 'L']),
    }),
  ),

  roles: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(2),
      responsibilities: z.string().min(10),
    }),
  ),

  screens: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(2),
      purpose: z.string().min(10),
      roleIds: z.array(z.string()).min(1),
      featureIds: z.array(z.string()),
    }),
  ),

  flow: z.array(
    z.object({
      fromScreenId: z.string().min(1),
      toScreenId: z.string().min(1),
      trigger: z.string().min(3),
    }),
  ),

  /** Things the proposal deliberately does not do, and why. */
  outOfScope: z.array(z.object({ item: z.string().min(3), reason: z.string().min(5) })),
})
export type Blueprint = z.infer<typeof Blueprint>
export const BLUEPRINT_SPEC = spec('solution_blueprint', Blueprint)
