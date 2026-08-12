import type { Corpus } from '../evidence'
import type { Brief } from '../schema/brief'
import type { Blueprint } from '../schema/blueprint'
import type { GapRow } from '../schema/gaps'
import type { Conflict } from '../schema/signals'
import type { ClaimOverride } from '../types'
import { coverageScore } from '../pipeline/gaps'

/**
 * Renders the whole engagement as a single markdown document.
 *
 * Citations become numbered footnotes carrying the source, the locator and the
 * quoted text, so the document keeps its evidence chain outside the
 * application. A brief that loses its provenance the moment it is exported is
 * a brief whose provenance was decorative.
 */
export function toMarkdown(args: {
  client: string
  engagement: string
  brief: Brief
  blueprint?: Blueprint
  conflicts: Conflict[]
  gaps: GapRow[]
  corpus: Corpus
  overrides: Record<string, ClaimOverride>
  generatedAt: string
}): string {
  const { brief, blueprint, conflicts, gaps, corpus, overrides } = args

  const notes: string[] = []
  const seen = new Map<string, number>()

  /** Adds a footnote for a citation and returns its marker. */
  const ref = (evidenceIds: string[], quote: string): string => {
    const key = `${evidenceIds.join(',')}|${quote}`
    const existing = seen.get(key)
    if (existing) return `[^${existing}]`

    const n = notes.length + 1
    seen.set(key, n)

    const where = evidenceIds
      .map((id) => {
        const u = corpus.get(id)
        return u ? `${u.sourceType}, ${u.locator}` : `${id} (not found)`
      })
      .join('; ')

    notes.push(`[^${n}]: ${where} — “${quote.replace(/\n/g, ' ')}” \`${evidenceIds.join(' ')}\``)
    return `[^${n}]`
  }

  /** Applies the consultant's edit or rejection, if there is one. */
  const claim = (id: string, text: string): string | null => {
    const o = overrides[id]
    if (o?.status === 'REJECTED') return null
    if (o?.status === 'EDITED' && o.text) return `${o.text} *(edited by the consultant)*`
    if (o?.status === 'ACCEPTED') return `${text} ✓`
    return text
  }

  const L: string[] = []
  const score = coverageScore(gaps)

  L.push(`# ${args.client} — ${args.engagement}`)
  L.push('')
  L.push(`*Discovery brief generated ${new Date(args.generatedAt).toLocaleString('en-GB')}. Every claim is`)
  L.push(`footnoted to the client's own material. Discovery coverage: ${score.pct}% —`)
  L.push(`${score.covered} of ${gaps.length} checklist questions answered, ${score.missing} not asked at all.*`)
  L.push('')
  L.push('---')
  L.push('')
  L.push('## Summary')
  L.push('')
  L.push(brief.executiveSummary)
  L.push('')

  L.push('## The goal')
  L.push('')
  const goal = claim('goal', brief.goal.statement)
  if (goal) L.push(`${goal}${ref(brief.goal.citation.evidenceIds, brief.goal.citation.quote)}`)
  L.push('')

  L.push('## How it works today')
  L.push('')
  for (const s of brief.currentProcess) {
    const t = claim(`step-${s.step}`, `**${s.name}** — ${s.actor}. ${s.detail}`)
    if (!t) continue
    L.push(`${s.step}. ${t}${s.isBottleneck ? ' *(work waits here)*' : ''}${ref(s.citation.evidenceIds, s.citation.quote)}`)
  }
  L.push('')

  L.push('## What it costs them')
  L.push('')
  L.push('| | Pain point | Impact | Affects | Confidence |')
  L.push('|---|---|---|---|---|')
  for (const p of [...brief.painPoints].sort((a, b) => rank(b.impact) - rank(a.impact))) {
    const t = claim(p.id, p.statement)
    if (!t) continue
    L.push(`| ${p.id} | ${t}${ref(p.citation.evidenceIds, p.citation.quote)} | ${p.impact} | ${p.affects} | ${p.confidence} |`)
  }
  L.push('')

  L.push('## Requirements')
  L.push('')
  for (const level of ['MUST', 'SHOULD', 'COULD', 'WONT'] as const) {
    const rows = brief.requirements.filter((r) => r.moscow === level)
    if (rows.length === 0) continue
    L.push(`### ${level}`)
    L.push('')
    for (const r of rows) {
      const t = claim(r.id, r.statement)
      if (!t) continue
      L.push(`- **${r.id}** ${t}${ref(r.citation.evidenceIds, r.citation.quote)}`)
    }
    L.push('')
  }

  if (brief.constraints.length) {
    L.push('## Constraints')
    L.push('')
    for (const c of brief.constraints) {
      const t = claim(c.id, c.statement)
      if (t) L.push(`- **${c.id}** ${t}${ref(c.citation.evidenceIds, c.citation.quote)}`)
    }
    L.push('')
  }

  if (conflicts.length) {
    L.push('## Where the sources disagree')
    L.push('')
    L.push('*None of these appears in any single document. They exist only across the pack.*')
    L.push('')
    for (const c of conflicts) {
      L.push(`### ${c.subject} — ${c.severity}`)
      L.push('')
      L.push(`- **${c.sideA.sourceLabel}:** ${c.sideA.claim}${ref(c.sideA.evidenceIds, c.sideA.quote)}`)
      L.push(`- **${c.sideB.sourceLabel}:** ${c.sideB.claim}${ref(c.sideB.evidenceIds, c.sideB.quote)}`)
      L.push('')
      L.push(`${c.whyItMatters}`)
      L.push('')
      L.push(`> **Ask the client:** ${c.resolutionQuestion}`)
      L.push('')
    }
  }

  const unanswered = gaps.filter((g) => g.status !== 'COVERED')
  if (unanswered.length) {
    L.push('## What we still need to know')
    L.push('')
    L.push(`*${gaps.filter((g) => g.status === 'MISSING').length} of ${gaps.length} discovery questions are not addressed by the pack at all.*`)
    L.push('')
    for (const g of unanswered.sort((a, b) => (a.status === 'MISSING' ? -1 : 1))) {
      L.push(`- **${g.questionId} · ${g.dimension}** *(${g.status.toLowerCase()})* — ${g.clientQuestion}`)
    }
    L.push('')
  }

  if (brief.openQuestions.length) {
    L.push('## Open questions')
    L.push('')
    for (const q of brief.openQuestions) {
      L.push(`- ${q.question}${q.raisedByConflictId ? ' *(sources disagree)*' : ''}`)
      L.push(`  - *${q.why}*`)
    }
    L.push('')
  }

  if (blueprint) {
    L.push('---')
    L.push('')
    L.push('## Proposed way of working')
    L.push('')
    L.push(blueprint.summary)
    L.push('')
    L.push('| Step | | Disposition | Why | Resolves |')
    L.push('|---|---|---|---|---|')
    for (const s of blueprint.toBeProcess) {
      L.push(`| ${s.step} | ${s.name} — ${s.actor} | **${s.disposition}** | ${s.rationale} | ${s.resolvesPainIds.join(', ') || '—'} |`)
    }
    L.push('')

    L.push('## Proposed solution')
    L.push('')
    L.push('| | Feature | Priority | Effort | Requirements |')
    L.push('|---|---|---|---|---|')
    for (const f of blueprint.features) {
      L.push(`| ${f.id} | **${f.name}** — ${f.description} | ${f.priority} | ${f.effort} | ${f.requirementIds.join(', ')} |`)
    }
    L.push('')

    L.push('### Roles')
    L.push('')
    for (const r of blueprint.roles) L.push(`- **${r.name}** — ${r.responsibilities}`)
    L.push('')

    L.push('### Screens')
    L.push('')
    for (const s of blueprint.screens) {
      const who = s.roleIds.map((rid) => blueprint.roles.find((r) => r.id === rid)?.name ?? rid).join(', ')
      L.push(`- **${s.name}** (${who}) — ${s.purpose}`)
    }
    L.push('')

    if (blueprint.outOfScope.length) {
      L.push('### Deliberately out of scope')
      L.push('')
      for (const o of blueprint.outOfScope) L.push(`- **${o.item}** — ${o.reason}`)
      L.push('')
    }
  }

  L.push('---')
  L.push('')
  L.push('## Evidence')
  L.push('')
  L.push(...notes)
  L.push('')

  return L.join('\n')
}

const rank = (i: string) => (i === 'HIGH' ? 3 : i === 'MEDIUM' ? 2 : 1)
