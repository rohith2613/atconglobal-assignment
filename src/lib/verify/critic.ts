import type { Corpus } from '../evidence'
import type { LlmClient } from '../llm/types'
import { CRITIC_SPEC, CRITIC_SYSTEM, type CriticVerdict } from '../schema/critic'
import type { Brief } from '../schema/brief'
import type { Blueprint } from '../schema/blueprint'

/**
 * Tier 2: an adversarial reviewer.
 *
 * It sees the claims and, for each, the exact text of the evidence they cite —
 * a few hundred tokens regardless of how large the corpus is. It never sees the
 * whole corpus, because the question is not "is there support somewhere" but
 * "does the cited support say this".
 *
 * It is a separate call from a separate role. An extractor asked to grade its
 * own completion, in the same completion, says yes essentially always: the
 * tokens it is grading are the tokens it just chose.
 */

type CritiqueCtx = { runId: string; engagementId: string; stage: string; attempt: number }

function renderClaimsWithEvidence(
  claims: { id: string; label: string; claim: string; evidenceIds: string[]; quote: string }[],
  corpus: Corpus,
): string {
  return claims
    .map((c) => {
      const evidence = c.evidenceIds
        .map((id) => {
          const u = corpus.get(id)
          return u ? `    ${id} [${u.sourceType} · ${u.locator}]: "${u.text}"` : `    ${id}: NOT FOUND IN CORPUS`
        })
        .join('\n')
      return `${c.id} — ${c.label}\n  CLAIM: ${c.claim}\n  QUOTED: "${c.quote}"\n  CITED EVIDENCE:\n${evidence}`
    })
    .join('\n\n')
}

export async function critiqueBrief(
  brief: Brief,
  corpus: Corpus,
  llm: LlmClient,
  ctx: CritiqueCtx,
): Promise<CriticVerdict> {
  const claims = [
    { id: 'goal', label: 'Goal', claim: brief.goal.statement, ...brief.goal.citation },
    ...brief.painPoints.map((p) => ({
      id: p.id,
      label: `Pain point (impact ${p.impact})`,
      claim: p.statement,
      ...p.citation,
    })),
    ...brief.requirements.map((r) => ({
      id: r.id,
      label: `Requirement (${r.moscow})`,
      claim: r.statement,
      ...r.citation,
    })),
    ...brief.constraints.map((c) => ({ id: c.id, label: 'Constraint', claim: c.statement, ...c.citation })),
  ]

  const { data } = await llm.complete<CriticVerdict>({
    role: 'critic',
    stage: ctx.stage,
    runId: ctx.runId,
    engagementId: ctx.engagementId,
    attempt: ctx.attempt,
    system: CRITIC_SYSTEM,
    user: `Review this discovery brief's claims against their cited evidence.

${renderClaimsWithEvidence(claims, corpus)}

For each claim, decide whether the cited evidence genuinely supports it as stated. Pay particular attention to numbers, dates, headcounts and firm commitments — those are where a stretched interpretation does real damage in a proposal.`,
    schema: CRITIC_SPEC,
    summary: `critique brief (${claims.length} claims, attempt ${ctx.attempt})`,
  })

  return data
}

export async function critiqueBlueprint(
  bp: Blueprint,
  brief: Brief,
  llm: LlmClient,
  ctx: CritiqueCtx,
): Promise<CriticVerdict> {
  const reqIndex = brief.requirements.map((r) => `  ${r.id} (${r.moscow}): ${r.statement}`).join('\n')
  const painIndex = brief.painPoints.map((p) => `  ${p.id} (${p.impact}): ${p.statement}`).join('\n')

  const features = bp.features
    .map((f) => `  ${f.id} "${f.name}" [${f.priority}] → requirements ${f.requirementIds.join(', ')}\n     ${f.description}`)
    .join('\n')

  const steps = bp.toBeProcess
    .map((s) => `  ${s.step}. ${s.name} [${s.disposition}] by ${s.actor} → resolves ${s.resolvesPainIds.join(', ') || 'nothing'}\n     ${s.rationale}`)
    .join('\n')

  const { data } = await llm.complete<CriticVerdict>({
    role: 'critic',
    stage: ctx.stage,
    runId: ctx.runId,
    engagementId: ctx.engagementId,
    attempt: ctx.attempt,
    system: `${CRITIC_SYSTEM}

For a solution blueprint, additionally FAIL when:
- A feature is mapped to a requirement it does not actually satisfy.
- A step marked AUTOMATE requires human judgement that the evidence shows is real (approvals, negotiation, exception handling).
- A step marked ELIMINATE removes work the process still needs done somewhere.
- The proposal solves a problem the brief did not establish, or ignores a HIGH-impact pain point.`,
    user: `Review this solution blueprint against the brief it claims to serve.

REQUIREMENTS IN THE BRIEF:
${reqIndex}

PAIN POINTS IN THE BRIEF:
${painIndex}

PROPOSED TO-BE PROCESS:
${steps}

PROPOSED FEATURES:
${features}

Judge whether each feature genuinely satisfies the requirements it claims, and whether each disposition is defensible.`,
    schema: CRITIC_SPEC,
    summary: `critique blueprint (${bp.features.length} features, attempt ${ctx.attempt})`,
  })

  return data
}
