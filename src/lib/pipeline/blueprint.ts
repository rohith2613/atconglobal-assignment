import { config } from '../config'
import type { LlmClient } from '../llm/types'
import { BLUEPRINT_SPEC, DISPOSITION_MEANING, type Blueprint, type Disposition } from '../schema/blueprint'
import type { Brief } from '../schema/brief'
import type { GapRow } from '../schema/gaps'
import { critiqueBlueprint, runLoop, validateBlueprint, type Violation } from '../verify'
import type { EventFn } from './events'

/**
 * Designs the better process and the application that supports it.
 *
 * The brief is the only input. That is deliberate: if the blueprint could see
 * the raw corpus it would start solving problems the brief never established,
 * and the traceability from feature back to requirement back to evidence — the
 * thing that makes the proposal defensible — would break.
 */

const SYSTEM = `You are a solution consultant designing a better way of working, and the application that supports it, from a discovery brief.

Work through the current process step by step and give each step a disposition:

${(Object.keys(DISPOSITION_MEANING) as Disposition[]).map((d) => `- ${d}: ${DISPOSITION_MEANING[d]}`).join('\n')}

RULES:

1. Every to-be step must state which pain point ids it resolves. Every HIGH-impact pain point in the brief must be resolved by at least one step. A proposal that leaves the client's worst problem untouched has missed the point, however elegant the rest is.

2. Every feature must map to at least one requirement id that is actually in the brief. Do not invent requirement ids. A feature that traces to nothing is scope the client never asked for, and on fixed-price work that is where the money goes.

3. Be honest about AUTOMATE. Automate arithmetic, lookups, copying, routing and notification. Do NOT automate judgement: negotiation, approving an unusual price, deciding whether an exception is acceptable. Where a control exists for a reason — an approval introduced after a bad year — SIMPLIFY its scope rather than ELIMINATE it. Removing a control the business put there deliberately is how a proposal loses credibility in the room.

4. ELIMINATE is for steps that exist only to compensate for a problem the new process removes. A weekly reconciliation between two systems disappears when the data is entered once. Say so explicitly in the rationale.

5. Prefer the smallest solution that resolves the pain points. Three screens that work beat nine that are described. Put genuinely valuable but non-essential ideas in outOfScope with the reason, so the client can see they were considered and why they were left out.

6. Priorities: P0 is required for the first useful release. P1 is the next increment. P2 is desirable later. If most things are P0 the plan is not a plan.

7. Screens are what a user opens, named as that user would name it. Every screen serves at least one role. The flow must let someone actually get from the first screen to the last — check that the screen ids in flow all exist.

8. Where the brief has open questions that would change the design, do not silently pick an answer. Design for what the brief supports and record the alternative in outOfScope.

Ids: features F1, F2…; roles RO1, RO2…; screens SC1, SC2…`

export async function buildBlueprint(args: {
  brief: Brief
  gaps: GapRow[]
  llm: LlmClient
  runId: string
  engagementId: string
  onEvent: EventFn
}): Promise<{ blueprint: Blueprint; needsHumanReview: boolean; violations: Violation[] }> {
  const { brief, gaps, llm, runId, engagementId, onEvent } = args

  const briefBlock = [
    `GOAL: ${brief.goal.statement}`,
    '',
    'CURRENT PROCESS:',
    ...brief.currentProcess.map(
      (s) => `  ${s.step}. ${s.name} — ${s.actor}${s.isBottleneck ? '  [BOTTLENECK]' : ''}\n     ${s.detail}`,
    ),
    '',
    'PAIN POINTS:',
    ...brief.painPoints.map((p) => `  ${p.id} [${p.impact}] ${p.statement} (affects: ${p.affects})`),
    '',
    'REQUIREMENTS:',
    ...brief.requirements.map((r) => `  ${r.id} [${r.moscow}] ${r.statement}`),
    '',
    'CONSTRAINTS (these limit what you may propose):',
    ...brief.constraints.map((c) => `  ${c.id} ${c.statement}`),
    '',
    'STAKEHOLDERS:',
    ...brief.stakeholders.map((s) => `  ${s.name} — ${s.role}`),
    '',
    'EXISTING SYSTEMS:',
    ...brief.systems.map((s) => `  ${s.name} — ${s.role}`),
    '',
    'OPEN QUESTIONS (unresolved; do not silently assume answers):',
    ...brief.openQuestions.map((q) => `  ${q.id} ${q.question}`),
  ].join('\n')

  const risky = gaps.filter((g) => g.status === 'MISSING').slice(0, 8)
  const gapBlock = risky.length
    ? `\n\nTHE PACK DOES NOT ANSWER THESE AT ALL. Do not design as though they were settled:\n${risky.map((g) => `  ${g.questionId} ${g.question}`).join('\n')}`
    : ''

  const result = await runLoop<Blueprint>({
    stage: 'blueprint',
    maxAttempts: config.maxAttempts,
    onEvent: (e) => {
      if (e.t === 'retry') onEvent({ t: 'attempt', stage: 'blueprint', attempt: e.attempt, because: e.because })
      if (e.t === 'critiqued') {
        onEvent({
          t: 'note',
          stage: 'blueprint',
          text: `critic ${e.verdict}${e.issues ? ` — ${e.issues} issue${e.issues === 1 ? '' : 's'}` : ''}`,
        })
      }
    },
    generate: async (feedback, attempt) => {
      const { data } = await llm.complete<Blueprint>({
        role: 'synthesizer',
        stage: 'blueprint',
        runId,
        engagementId,
        attempt,
        system: SYSTEM,
        user: `${briefBlock}${gapBlock}\n\nDesign the better process and the application that supports it.${feedback ? `\n\n---\n\n${feedback}` : ''}`,
        schema: BLUEPRINT_SPEC,
        summary: `design blueprint${attempt > 1 ? ` (attempt ${attempt})` : ''}`,
      })
      return data
    },
    validate: (bp) => validateBlueprint(bp, brief),
    critique: (bp, attempt) => critiqueBlueprint(bp, brief, llm, { runId, engagementId, stage: 'blueprint', attempt }),
  })

  return { blueprint: result.value, needsHumanReview: result.needsHumanReview, violations: result.violations }
}

// ---------------------------------------------------------------------------
// Mermaid rendering
// ---------------------------------------------------------------------------

/**
 * Mermaid escapes almost nothing. A quote or a bracket in a client's own step
 * name — "Receive 'RFQ' by email" — breaks the whole diagram, so node text goes
 * through the HTML entities Mermaid does understand.
 */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '#quot;')
    .replace(/'/g, '#39;')
    .replace(/[[\]{}()]/g, ' ')
    .replace(/\|/g, '/')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .trim()
}

export type DiagramStep = {
  step: number
  name: string
  actor?: string
  disposition?: Disposition
  isBottleneck?: boolean
}

export function toMermaid(steps: DiagramStep[], title: string): string {
  if (steps.length === 0) return `flowchart TD\n  empty["No steps recorded"]`

  const lines = ['flowchart TD']
  const ordered = [...steps].sort((a, b) => a.step - b.step)

  for (const s of ordered) {
    const label = [esc(s.name), s.actor ? esc(s.actor) : null].filter(Boolean).join('<br/>')
    // ELIMINATE renders as a different SHAPE as well as a different colour —
    // disposition must never be conveyed by colour alone.
    const node =
      s.disposition === 'ELIMINATE'
        ? `S${s.step}[/"${label}"\\]`
        : s.disposition === 'AUTOMATE'
          ? `S${s.step}[["${label}"]]`
          : `S${s.step}["${label}"]`
    lines.push(`  ${node}`)
  }

  for (let i = 0; i < ordered.length - 1; i++) {
    lines.push(`  S${ordered[i].step} --> S${ordered[i + 1].step}`)
  }

  lines.push(
    '  classDef keep fill:#1c2733,stroke:#3d5163,color:#dbe6f0',
    '  classDef simplify fill:#1b2f3a,stroke:#3f7d9e,color:#cfeaf7',
    '  classDef automate fill:#16302a,stroke:#3f8f70,color:#c9f0dd',
    '  classDef eliminate fill:#33221f,stroke:#9e5b4d,color:#f3d2c9',
    '  classDef bottleneck fill:#33261a,stroke:#b08040,color:#f6dfc0',
  )

  for (const s of ordered) {
    if (s.disposition) lines.push(`  class S${s.step} ${s.disposition.toLowerCase()}`)
    else if (s.isBottleneck) lines.push(`  class S${s.step} bottleneck`)
    else lines.push(`  class S${s.step} keep`)
  }

  return lines.join('\n')
}

export const asIsDiagram = (brief: Brief) =>
  toMermaid(
    brief.currentProcess.map((s) => ({ step: s.step, name: s.name, actor: s.actor, isBottleneck: s.isBottleneck })),
    'As-is',
  )

export const toBeDiagram = (bp: Blueprint) =>
  toMermaid(
    bp.toBeProcess.map((s) => ({ step: s.step, name: s.name, actor: s.actor, disposition: s.disposition })),
    'To-be',
  )

/** Feature × requirement traceability, with unmapped rows called out. */
export function traceabilityMatrix(bp: Blueprint, brief: Brief) {
  const reqIds = brief.requirements.map((r) => r.id)
  return {
    requirements: brief.requirements,
    features: bp.features,
    covers: (featureId: string, reqId: string) =>
      bp.features.find((f) => f.id === featureId)?.requirementIds.includes(reqId) ?? false,
    /** Requirements no feature delivers. Visible gaps beat invisible ones. */
    uncovered: reqIds.filter((id) => !bp.features.some((f) => f.requirementIds.includes(id))),
  }
}
