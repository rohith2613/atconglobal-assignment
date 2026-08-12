import { config } from '../config'
import type { Corpus } from '../evidence'
import type { LlmClient } from '../llm/types'
import { BRIEF_SPEC, type Brief } from '../schema/brief'
import type { GapRow } from '../schema/gaps'
import type { Conflict, Signal } from '../schema/signals'
import { critiqueBrief, runLoop, validateBrief, type Violation } from '../verify'
import type { EventFn } from './events'

/**
 * Turns reconciled signals into the Discovery Brief.
 *
 * This is the one stage that reads everything at once, and the only one given
 * the strong model. It is also the stage where a plausible-sounding
 * fabrication does the most damage, because the brief is the document the
 * client reads — so it is wrapped in both verification tiers.
 */

const SYSTEM = `You are a senior consultant writing the discovery brief that goes back to the client after the first round of meetings. It will be read by people who were in those meetings and will notice anything you got wrong.

You are given signals already extracted from their own material, the contradictions found between their sources, and an assessment of what the pack still does not answer. Assemble the brief.

RULES:

1. Every claim about the client MUST carry a citation: evidence ids from the list you are given, plus a quote copied character for character out of the evidence text shown against those ids.

   Quotes are checked against the source and a mismatch means the whole brief is regenerated, so this is the single most expensive thing to get wrong.

   Copy, do not retype. Quote the SHORTEST span that carries the claim — a four-word quote is far likelier to be exact than a twenty-word one.

   Given evidence text: "That takes about two days. Sometimes three."
     RIGHT: "takes about two days"
     WRONG: "takes about 2 days"                (changed a word to a numeral)
     WRONG: "it takes about two days"           (added a word)
     WRONG: "takes two days, sometimes three"   (dropped a word, changed punctuation)

   If your claim draws on two evidence units, cite BOTH ids and quote from either — the check is run against the units you cite, taken together.

   If you cannot find a verbatim span that supports a claim, the claim does not belong in the brief.

2. Say only what the material supports. Do not add industry best practice, do not infer a requirement nobody stated, and do not upgrade a passing remark into a firm commitment. If something matters and the material does not settle it, that belongs in openQuestions, not in requirements.

3. Use the client's own vocabulary. If they say "the quotation desk", do not write "the pricing team".

4. currentProcess is what happens TODAY, in order, with the real actor for each step. Include the steps that are obviously wasteful — those are the ones the proposal will change. Mark isBottleneck true where work visibly waits.

5. painPoints are what costs them time, money or business today. Rank by real impact, not by how often it was mentioned. A quiet remark about margin lost on mis-keyed prices outranks a loud complaint about the software looking dated. "affects" names who feels it — a pain nobody owns never gets funded.

6. requirements are capabilities the solution must have, each traceable to something in the material. MUST is reserved for things the business genuinely cannot operate without. If everything is a MUST the prioritisation is worthless.

7. openQuestions. Every contradiction you were given MUST produce an open question with raisedByConflictId set to that conflict's id — a disagreement the brief noticed but asked nothing about looks handled, which is worse than missing it. Also raise a question for each MISSING checklist item that would change the shape of the solution. Set raisedByConflictId to null for those.

8. executiveSummary: one paragraph, no bullet points, that a partner could read aloud. What they are trying to achieve, what is in the way, and what the biggest unknown is. No preamble about the purpose of the document.

Ids: pain points P1, P2…; requirements R1, R2…; constraints C1, C2…; open questions Q1, Q2…`

export async function synthesiseBrief(args: {
  signals: Signal[]
  conflicts: Conflict[]
  gaps: GapRow[]
  corpus: Corpus
  llm: LlmClient
  runId: string
  engagementId: string
  onEvent: EventFn
}): Promise<{ brief: Brief; needsHumanReview: boolean; violations: Violation[] }> {
  const { signals, conflicts, gaps, corpus, llm, runId, engagementId, onEvent } = args

  const citedIds = [...new Set(signals.flatMap((s) => s.citation.evidenceIds))]
  const evidenceBlock = citedIds
    .map((id) => {
      const u = corpus.get(id)
      return u ? `${id} [${u.sourceType} · ${u.locator}]\n  ${u.text.replace(/\n/g, ' ')}` : null
    })
    .filter(Boolean)
    .join('\n')

  const signalBlock = signals
    .map(
      (s) =>
        `${s.type} [${s.subject}] (confidence ${s.confidence}) ${s.statement}${s.detail ? ` — ${s.detail}` : ''}\n   cites ${s.citation.evidenceIds.join(', ')}`,
    )
    .join('\n')

  const conflictBlock = conflicts.length
    ? conflicts
        .map(
          (c) =>
            `${c.id} [${c.severity}] ${c.subject}\n   A (${c.sideA.sourceLabel}): ${c.sideA.claim}\n   B (${c.sideB.sourceLabel}): ${c.sideB.claim}\n   suggested question: ${c.resolutionQuestion}`,
        )
        .join('\n\n')
    : '(none found)'

  const unanswered = gaps.filter((g) => g.status !== 'COVERED')
  const gapBlock = unanswered.length
    ? unanswered.map((g) => `${g.questionId} [${g.status}] ${g.question}\n   ${g.clientQuestion ?? ''}`).join('\n\n')
    : '(the pack answers every checklist question)'

  const result = await runLoop<Brief>({
    stage: 'synthesize',
    maxAttempts: config.maxAttempts,
    onEvent: (e) => {
      if (e.t === 'retry') onEvent({ t: 'attempt', stage: 'synthesize', attempt: e.attempt, because: e.because })
      if (e.t === 'critiqued') {
        onEvent({
          t: 'note',
          stage: 'synthesize',
          text: `critic ${e.verdict}${e.issues ? ` — ${e.issues} issue${e.issues === 1 ? '' : 's'}` : ''}`,
        })
      }
    },
    generate: async (feedback, attempt) => {
      const { data } = await llm.complete<Brief>({
        role: 'synthesizer',
        stage: 'synthesize',
        runId,
        engagementId,
        attempt,
        system: SYSTEM,
        user: `════ EVIDENCE (quote only from here) ════

${evidenceBlock}

════ SIGNALS ════

${signalBlock}

════ CONTRADICTIONS BETWEEN SOURCES (each MUST raise an open question) ════

${conflictBlock}

════ CHECKLIST ITEMS THE PACK DOES NOT FULLY ANSWER ════

${gapBlock}

════

Write the discovery brief.${feedback ? `\n\n---\n\n${feedback}` : ''}`,
        schema: BRIEF_SPEC,
        summary: `synthesise brief from ${signals.length} signals${attempt > 1 ? ` (attempt ${attempt})` : ''}`,
      })
      return data
    },
    validate: (brief) => validateBrief(brief, corpus, conflicts),
    critique: (brief, attempt) =>
      critiqueBrief(brief, corpus, llm, { runId, engagementId, stage: 'synthesize', attempt }),
  })

  return { brief: result.value, needsHumanReview: result.needsHumanReview, violations: result.violations }
}
