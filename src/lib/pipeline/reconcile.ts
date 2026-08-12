import { config } from '../config'
import type { Corpus } from '../evidence'
import type { LlmClient } from '../llm/types'
import {
  CONFLICTS_SPEC,
  MERGE_SPEC,
  type Conflict,
  type Signal,
} from '../schema/signals'
import type { EventFn } from './events'

/**
 * Reconciliation is where a pile of per-source signals becomes one view of the
 * client — and where the disagreements between sources become visible.
 *
 * Two things happen here that cannot happen anywhere else in the pipeline:
 * corroboration (the same claim from three sources is stronger than from one)
 * and contradiction (two sources that cannot both be right). Neither exists
 * inside a single document, which is why per-source extraction cannot find them
 * and why a consultant reading files one at a time misses them.
 */

/**
 * Cosine threshold for sending a pair to the merge judge.
 *
 * 0.86 was too strict against real data: it produced one candidate pair across
 * 160 signals, so almost nothing merged, so almost nothing accumulated evidence
 * from a second source, so almost nothing could reach HIGH confidence. 0.78
 * surfaces genuine restatements across sources; the judge is conservative and
 * rejects the rest, which is the cheaper error.
 */
const MERGE_THRESHOLD = 0.78

export function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const d = Math.sqrt(na) * Math.sqrt(nb)
  return d === 0 ? 0 : dot / d
}

/**
 * Near-duplicate candidates for the merge judge.
 *
 * Only same-type pairs are considered. A GOAL and a PAIN_POINT can be about the
 * same subject in nearly the same words — "get quotes out same day" and "quotes
 * take two days" embed almost identically — and merging them would destroy the
 * distinction the brief is built on.
 *
 * Pairs from the same source are also skipped: within one document the model
 * already had the chance to say it once, so two similar signals there are
 * usually a genuine distinction it chose to draw.
 */
export function candidatePairs(
  signals: Signal[],
  vectors: number[][],
  threshold = MERGE_THRESHOLD,
): [number, number][] {
  const pairs: [number, number][] = []
  for (let i = 0; i < signals.length; i++) {
    for (let j = i + 1; j < signals.length; j++) {
      if (signals[i].type !== signals[j].type) continue
      if (sourceOf(signals[i].id) === sourceOf(signals[j].id)) continue
      if (cosine(vectors[i], vectors[j]) >= threshold) pairs.push([i, j])
    }
  }
  return pairs
}

const sourceOf = (signalId: string) => signalId.split(':')[0]

/**
 * Confidence, recomputed after merging.
 *
 * The semantic is deliberate and narrow: **HIGH means more than one independent
 * source said it.** A single-source claim is capped at MEDIUM however plainly it
 * was stated, because the risk being measured is not "did the model mishear" —
 * the quote validator already settles that — it is "is this one person's view".
 *
 * The first version simply passed the extractor's own judgement through for
 * single-source signals, and since extraction runs per source that meant
 * everything was single-source and the extractor rated nearly all of it HIGH.
 * 181 of 181 signals came back HIGH, which is the same as having no confidence
 * field at all. A grading that never discriminates is worse than none, because
 * it looks like information.
 */
export function scoreConfidence(signal: Signal, corpus: Corpus): Signal['confidence'] {
  const sources = new Set(signal.citation.evidenceIds.map((id) => corpus.get(id)?.sourceId).filter(Boolean))

  if (sources.size >= 3) return 'HIGH'
  if (sources.size === 2) return signal.confidence === 'LOW' ? 'MEDIUM' : 'HIGH'
  // Single source: cap at MEDIUM, and let a hedged remark stay LOW.
  return signal.confidence === 'HIGH' ? 'MEDIUM' : 'LOW'
}

function applyMerges(
  signals: Signal[],
  merges: { keepId: string; dropId: string }[],
  corpus: Corpus,
): Signal[] {
  const byId = new Map(signals.map((s) => [s.id, { ...s, citation: { ...s.citation } }]))
  const dropped = new Set<string>()

  for (const m of merges) {
    const keep = byId.get(m.keepId)
    const drop = byId.get(m.dropId)
    if (!keep || !drop || dropped.has(m.keepId) || dropped.has(m.dropId)) continue

    // The merged signal accumulates evidence from every source that said it.
    // This is what makes corroboration measurable rather than a feeling.
    keep.citation.evidenceIds = [...new Set([...keep.citation.evidenceIds, ...drop.citation.evidenceIds])]
    if (drop.detail && !keep.detail.includes(drop.detail)) {
      keep.detail = `${keep.detail} ${drop.detail}`.trim()
    }
    dropped.add(m.dropId)
  }

  return [...byId.values()]
    .filter((s) => !dropped.has(s.id))
    .map((s) => ({ ...s, confidence: scoreConfidence(s, corpus) }))
}

const MERGE_SYSTEM = `You are deduplicating business signals extracted from different sources in the same client discovery pack.

You will be shown candidate pairs that a similarity model thinks might be the same claim. Decide which pairs are GENUINELY the same claim said twice, in different words, by different people.

Merge only when both members assert the same thing about the same subject. When merged, the surviving signal keeps its own wording and gains the other's evidence.

Do NOT merge when:
- one is more specific than the other ("quotes are slow" vs "quotes take two days") — the specific one is a different, better claim
- they concern different actors, systems, branches or time periods
- they NUMERICALLY DISAGREE. Two sources giving different figures for the same thing is a contradiction, and a later stage needs to see both. Merging them destroys the finding.
- you are unsure

Returning an empty merge list is a perfectly good answer. Over-merging silently deletes evidence; under-merging just leaves a slightly longer list.`

const CONFLICT_SYSTEM = `You are a consultant reviewing a client discovery pack for CONTRADICTIONS between sources.

A contradiction is where two sources cannot both be true, or where acting on one would be incompatible with acting on the other. These are the findings that matter most in discovery, because no single document contains one — they only exist across the pack — and because they surface later as change requests if nobody catches them now.

Report a contradiction when sources disagree about:
- dates, deadlines or sequencing
- quantities: headcounts, volumes, values, durations, frequencies
- who owns, decides or approves something
- whether something is in scope, required, or already decided
- how the process actually works, as against how it is documented

Do NOT report:
- A GOAL DIFFERING FROM CURRENT PERFORMANCE. "We want quotes out same day" against "quotes take two days" is not a contradiction — it is the entire reason the engagement exists. A target and a baseline are not in conflict. This is the single most common mistake here; check every candidate against it before reporting.
- the same fact stated at different levels of detail
- a plan or intention differing from today's reality
- two people expressing different opinions where no fact is in dispute
- anything you cannot support with a verbatim quote from each side

A contradiction requires TWO DIFFERENT SOURCES. If both quotes come from the same document or the same speaker in the same conversation, it is not a contradiction — it is either a distinction you have misread, or a person revising their own statement.

severity:
- BLOCKING: work cannot responsibly proceed until this is settled. Committed dates, contractual scope, who pays.
- MATERIAL: it changes the estimate, the architecture or the plan. Volumes, headcounts, integration scope.
- MINOR: worth confirming but nothing depends on it.

Both sides MUST quote verbatim from the evidence, and cite the ids the quotes came from. The quotes are checked character by character.

resolutionQuestion must be a single question a consultant can paste into an email to the client without editing it. Name the specific disagreement. Do not write "please clarify the timeline" — write the question that actually settles it.

Finding no contradictions is a legitimate answer. Do not manufacture one.`

export async function reconcile(args: {
  signals: Signal[]
  corpus: Corpus
  llm: LlmClient
  runId: string
  engagementId: string
  onEvent: EventFn
}): Promise<{ signals: Signal[]; conflicts: Conflict[] }> {
  const { signals, corpus, llm, runId, engagementId, onEvent } = args
  if (signals.length === 0) return { signals: [], conflicts: [] }

  // ---- 1. dedup ------------------------------------------------------------

  onEvent({ t: 'progress', stage: 'reconcile', done: 0, total: 3, label: 'embedding signals' })

  const { data: vectors } = await llm.embed({
    runId,
    engagementId,
    stage: 'reconcile',
    texts: signals.map((s) => `${s.type}: ${s.subject}. ${s.statement}`),
  })

  const pairs = candidatePairs(signals, vectors)
  onEvent({
    t: 'note',
    stage: 'reconcile',
    text: `${pairs.length} near-duplicate candidate ${pairs.length === 1 ? 'pair' : 'pairs'} across sources`,
  })

  let merged = signals.map((s) => ({ ...s, confidence: scoreConfidence(s, corpus) }))

  if (pairs.length > 0) {
    const rendered = pairs
      .map(([i, j], n) => {
        const a = signals[i]
        const b = signals[j]
        return `PAIR ${n + 1}\n  A  ${a.id} [${a.type} · ${a.subject}] ${a.statement}\n  B  ${b.id} [${b.type} · ${b.subject}] ${b.statement}`
      })
      .join('\n\n')

    const { data } = await llm.complete<{ merges: { keepId: string; dropId: string; reason: string }[] }>({
      role: 'router',
      stage: 'reconcile',
      runId,
      engagementId,
      system: MERGE_SYSTEM,
      user: `Which of these candidate pairs are genuinely the same claim?\n\n${rendered}`,
      schema: MERGE_SPEC,
      summary: `dedup ${pairs.length} candidate pairs`,
    })

    merged = applyMerges(signals, data.merges, corpus)
    onEvent({
      t: 'note',
      stage: 'reconcile',
      text: `${data.merges.length} merged, ${merged.length} distinct signals remain`,
    })
  }

  onEvent({ t: 'progress', stage: 'reconcile', done: 2, total: 3, label: 'looking for contradictions' })

  // ---- 2. contradictions ---------------------------------------------------

  const sourceLabel = (s: Signal) => {
    const u = corpus.get(s.citation.evidenceIds[0])
    return u ? `${u.sourceType} · ${u.locator}` : 'unknown source'
  }

  // The evidence units the signals rest on are rendered IN FULL, not just the
  // one-line quote each extractor chose.
  //
  // The first version showed only the signals and their summary quotes, and
  // then required the reported contradiction to quote verbatim from the
  // evidence — text the model had never been shown. It duly found the go-live
  // contradiction and then had its quote rejected by the guard, so a correct
  // finding was thrown away. Asking a model to quote what it cannot see is a
  // bug in the harness, not in the model.
  const citedIds = [...new Set(merged.flatMap((s) => s.citation.evidenceIds))]
  const evidenceBlock = citedIds
    .map((id) => {
      const u = corpus.get(id)
      return u ? `${id} [${u.sourceType} · ${u.locator}]\n  ${u.text.replace(/\n/g, ' ')}` : null
    })
    .filter(Boolean)
    .join('\n')

  const signalBlock = merged
    .map(
      (s) =>
        `${s.id} [${s.type} · ${s.subject}] (${sourceLabel(s)})\n  ${s.statement}\n  cites: ${s.citation.evidenceIds.join(', ')}`,
    )
    .join('\n\n')

  const { data } = await llm.complete<{ conflicts: Conflict[] }>({
    role: 'synthesizer',
    stage: 'reconcile',
    runId,
    engagementId,
    system: CONFLICT_SYSTEM,
    user: `Below is the client's discovery pack: first the raw evidence, then the signals extracted from it.

Quote ONLY from the EVIDENCE section. Your quotes are checked character by character against it, and a contradiction whose quote cannot be found is discarded even if the finding is correct.

════ EVIDENCE ════

${evidenceBlock}

════ SIGNALS EXTRACTED ════

${signalBlock}

════

Signals sharing a subject are the likeliest place to find a disagreement, but check across subjects too. For each contradiction, cite the evidence ids and copy the exact text from the EVIDENCE section above.`,
    schema: CONFLICTS_SPEC,
    summary: `find contradictions across ${merged.length} signals, ${citedIds.length} evidence units`,
  })

  const conflicts = data.conflicts.filter((c) => discardReason(c, corpus, onEvent) === null)

  onEvent({ t: 'progress', stage: 'reconcile', done: 3, total: 3, label: `${conflicts.length} contradictions found` })

  return { signals: merged, conflicts }
}

/**
 * Who a piece of evidence is attributable to: the source, plus the speaker when
 * the locator names one.
 *
 * Source alone is the wrong granularity. Two people arguing in the same
 * WhatsApp group is a real contradiction — arguably the most valuable kind,
 * since it is the client disagreeing with itself in writing — and a source-level
 * check would throw it away. What actually needs excluding is one person
 * appearing to contradict themselves, which is nearly always a target being
 * read against a baseline.
 */
export function attributionOf(ids: string[], corpus: Corpus): Set<string> {
  const out = new Set<string>()
  for (const id of ids) {
    const u = corpus.get(id)
    if (!u) continue
    // "Priya Nair @ 00:02:41" and "Tom De Vries, msg #4 (03/06/2026 09:02)"
    // both name a speaker; "p.4 ¶2" and "Nordwind · Services" do not.
    const speaker = /^(.+?)(?: @ |, msg #)/.exec(u.locator)?.[1]?.trim() ?? ''
    out.add(`${u.sourceId}::${speaker}`)
  }
  return out
}

const sameAttribution = (a: Set<string>, b: Set<string>) =>
  a.size === 1 && b.size === 1 && [...a][0] === [...b][0]

/**
 * Deterministic guard on reported contradictions. Returns a reason to discard,
 * or null to keep.
 *
 * The critic can debate whether a contradiction is *important*; it must not be
 * able to invent one. A fabricated contradiction is worse than a missed one,
 * because it sends a consultant to the client asking about something nobody
 * said — which costs credibility in a way that silence does not.
 */
export function discardReason(
  c: Conflict,
  corpus: Corpus,
  onEvent: EventFn = () => {},
): string | null {
  const note = (reason: string) => {
    onEvent({ t: 'note', stage: 'reconcile', text: `discarded "${c.subject}" — ${reason}` })
    return reason
  }

  if (!corpus.supportsQuoteAcross(c.sideA.evidenceIds, c.sideA.quote)) {
    return note('side A quotes text that is not in the evidence it cites')
  }
  if (!corpus.supportsQuoteAcross(c.sideB.evidenceIds, c.sideB.quote)) {
    return note('side B quotes text that is not in the evidence it cites')
  }

  // One person cannot contradict themselves within a single source. When it
  // looks like they have, it is almost always a stated goal being read against
  // current performance — "quotes should go out same day" against "quotes take
  // two days" — which is the premise of the engagement, not a conflict.
  if (sameAttribution(attributionOf(c.sideA.evidenceIds, corpus), attributionOf(c.sideB.evidenceIds, corpus))) {
    return note('both sides are the same speaker in the same source, so this is a target read against a baseline')
  }

  return null
}
