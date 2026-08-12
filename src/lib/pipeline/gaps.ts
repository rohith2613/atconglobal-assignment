import { config } from '../config'
import type { Corpus } from '../evidence'
import type { LlmClient } from '../llm/types'
import { CHECKLIST_BY_ID, DISCOVERY_CHECKLIST, type GapDimension } from '../ontology/discovery-checklist'
import { GAPS_SPEC, type GapResult, type GapRow, type GapsOut } from '../schema/gaps'
import type { Signal } from '../schema/signals'
import { mapWithConcurrency, type EventFn } from './events'

/**
 * Scores the corpus against the fixed 30-question discovery checklist.
 *
 * The questions are asked in batches rather than one call each — 30 calls would
 * be slow and would pay for the same context 30 times — but the batches are
 * small, because a model given all 30 at once starts pattern-matching its own
 * earlier answers and the later dimensions all come back COVERED.
 */

const BATCH = 5

const SYSTEM = `You are a senior consultant auditing a client discovery pack for completeness before a fixed-price proposal is written.

For each checklist question, decide whether the pack answers it.

COVERED — the pack answers it clearly enough to plan and price against. Cite the evidence.
PARTIAL — the pack touches it but leaves something material undecided: a number without a basis, a system named without its interface, an intention without a commitment. Cite what there is, and ask for the rest.
MISSING — the pack does not address it at all.

Judge only what is in the pack. Do not credit an answer you would have to assume, infer from industry norms, or piece together from two unrelated remarks. The whole value of this exercise is finding what nobody asked, and a generous reading destroys it. When you are between COVERED and PARTIAL, choose PARTIAL. When you are between PARTIAL and MISSING, choose MISSING.

evidenceSummary: state what the pack actually says about this question before you decide, in one or two sentences. If it says nothing, say so.

evidenceIds: ids supporting your assessment. Empty for MISSING.

clientQuestion: for PARTIAL and MISSING, one question the consultant can send to the client unedited. Name the specific unknown. "Please clarify your data residency requirements" is useless; "Your Bergen and Rotterdam offices are in different jurisdictions — must quote and customer data for Norwegian shipments remain in Norway, or may it be hosted in the EU?" is the job. Reference what the pack DOES say wherever you can, so the client can see you have read it. Null for COVERED.`

export async function analyseGaps(args: {
  signals: Signal[]
  corpus: Corpus
  llm: LlmClient
  runId: string
  engagementId: string
  onEvent: EventFn
}): Promise<GapRow[]> {
  const { signals, corpus, llm, runId, engagementId, onEvent } = args

  // The signals are the digested view; the outline is there so the model can
  // notice something the extractor passed over.
  const signalBlock = signals
    .map((s) => `${s.type} [${s.subject}] ${s.statement} (evidence ${s.citation.evidenceIds.join(', ')})`)
    .join('\n')
  const outline = corpus.outline(14_000)

  const batches: (typeof DISCOVERY_CHECKLIST)[number][][] = []
  for (let i = 0; i < DISCOVERY_CHECKLIST.length; i += BATCH) {
    batches.push(DISCOVERY_CHECKLIST.slice(i, i + BATCH) as (typeof DISCOVERY_CHECKLIST)[number][])
  }

  let done = 0
  const results = await mapWithConcurrency(batches, config.concurrency, async (batch) => {
    const questions = batch
      .map((q) => `${q.id} [${q.dimension}] ${q.question}\n    why it matters: ${q.whyItMatters}`)
      .join('\n\n')

    const { data } = await llm.complete<GapsOut>({
      role: 'extractor',
      stage: 'gaps',
      runId,
      engagementId,
      system: SYSTEM,
      user: `CHECKLIST QUESTIONS TO ASSESS (return exactly one result per id, ${batch.length} in total):

${questions}

════ SIGNALS EXTRACTED FROM THE PACK ════

${signalBlock}

════ EVIDENCE INDEX ════

${outline}`,
      schema: GAPS_SPEC,
      summary: `assess ${batch.map((q) => q.id).join(',')}`,
    })

    done += batch.length
    onEvent({
      t: 'progress',
      stage: 'gaps',
      done,
      total: DISCOVERY_CHECKLIST.length,
      label: `${batch[0].dimension} — ${data.results.filter((r) => r.status !== 'COVERED').length} of ${batch.length} need follow-up`,
    })
    return data.results
  })

  const byId = new Map<string, GapResult>()
  for (const r of results.flat()) {
    if (CHECKLIST_BY_ID[r.questionId]) byId.set(r.questionId, r)
  }

  // Any question the model failed to return a verdict for is reported MISSING,
  // never dropped. A checklist that silently shrinks is worse than no checklist:
  // the whole point is that the row is there whether the pack mentions it or not.
  return DISCOVERY_CHECKLIST.map((q): GapRow => {
    const r = byId.get(q.id)
    return {
      questionId: q.id,
      dimension: q.dimension,
      question: q.question,
      whyItMatters: q.whyItMatters,
      status: r?.status ?? 'MISSING',
      evidenceSummary: r?.evidenceSummary ?? 'No assessment was returned for this question.',
      evidenceIds: (r?.evidenceIds ?? []).filter((id) => corpus.has(id)),
      clientQuestion: r?.status === 'COVERED' ? null : (r?.clientQuestion ?? q.question),
    }
  })
}

/** PARTIAL counts as half. 30 MISSING is 0%; 30 COVERED is 100%. */
export function coverageScore(gaps: { status: GapResult['status'] }[]): {
  covered: number
  partial: number
  missing: number
  pct: number
} {
  const covered = gaps.filter((g) => g.status === 'COVERED').length
  const partial = gaps.filter((g) => g.status === 'PARTIAL').length
  const missing = gaps.filter((g) => g.status === 'MISSING').length
  const total = gaps.length || 1
  return { covered, partial, missing, pct: Math.round(((covered + partial * 0.5) / total) * 100) }
}

export function coverageByDimension(gaps: GapRow[]): { dimension: GapDimension; pct: number; missing: number }[] {
  const dims = [...new Set(gaps.map((g) => g.dimension))] as GapDimension[]
  return dims.map((d) => {
    const rows = gaps.filter((g) => g.dimension === d)
    return { dimension: d, pct: coverageScore(rows).pct, missing: rows.filter((r) => r.status === 'MISSING').length }
  })
}

/** The deliverable: every open question, ordered so the worst gaps come first. */
export function clientQuestionList(gaps: GapRow[]): string {
  return gaps
    .filter((g) => g.clientQuestion)
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'MISSING' ? -1 : 1))
    .map((g, i) => `${i + 1}. [${g.dimension}] ${g.clientQuestion}`)
    .join('\n\n')
}
