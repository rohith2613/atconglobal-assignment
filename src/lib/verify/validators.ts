import type { Corpus } from '../evidence'
import type { Citation } from '../schema/common'
import type { Brief } from '../schema/brief'
import type { Blueprint } from '../schema/blueprint'
import type { AppSpec } from '../schema/appspec'
import type { Conflict, Signal } from '../schema/signals'
import type { Violation } from './types'

/**
 * Tier 1: deterministic verification. No LLM, no cost, not fooled by confident
 * prose.
 *
 * These run on every output, every attempt. They cannot judge whether a claim is
 * *wrong* — that is the critic's job — but they catch every way an output can be
 * *malformed*, and malformed is the failure mode that actually ships. A model
 * that invents an evidence id produces something indistinguishable from good
 * work at a glance, because the citation chip renders identically.
 */

const PLACEHOLDER_RE = /\b(TBD|TODO|FIXME|XXX|lorem ipsum)\b|\[\.\.\.\]|\[insert|<insert|\bplaceholder\b/i

const v = (
  code: Violation['code'],
  claimId: string,
  detail: string,
  severity: Violation['severity'] = 'ERROR',
): Violation => ({ code, claimId, detail, severity })

/** One citation-bearing claim, flattened out of whatever structure held it. */
type Claim = { id: string; label: string; text: string; citation: Citation }

function claimsOf(brief: Brief): Claim[] {
  const out: Claim[] = []
  const add = (id: string, label: string, text: string, citation: Citation) =>
    out.push({ id, label, text, citation })

  add('goal', 'Goal', brief.goal.statement, brief.goal.citation)
  brief.currentProcess.forEach((s) =>
    add(`step-${s.step}`, `Current process step ${s.step}`, `${s.name} ${s.detail}`, s.citation),
  )
  brief.painPoints.forEach((p) => add(p.id, `Pain point ${p.id}`, p.statement, p.citation))
  brief.requirements.forEach((r) => add(r.id, `Requirement ${r.id}`, r.statement, r.citation))
  brief.constraints.forEach((c) => add(c.id, `Constraint ${c.id}`, c.statement, c.citation))
  brief.stakeholders.forEach((s, i) => add(`stakeholder-${i}`, `Stakeholder ${s.name}`, `${s.name}, ${s.role}`, s.citation))
  brief.systems.forEach((s, i) => add(`system-${i}`, `System ${s.name}`, `${s.name}: ${s.role}`, s.citation))
  return out
}

/** Shared citation checking. Every claim in the system goes through this. */
function checkCitation(claim: Claim, corpus: Corpus): Violation[] {
  const out: Violation[] = []
  const ids = claim.citation.evidenceIds

  if (ids.length === 0) {
    out.push(v('UNGROUNDED_CLAIM', claim.id, `${claim.label} asserts something about the client with no evidence cited.`))
    return out
  }

  const unknown = ids.filter((id) => !corpus.has(id))
  if (unknown.length > 0) {
    out.push(
      v(
        'HALLUCINATED_EVIDENCE',
        claim.id,
        `${claim.label} cites ${unknown.join(', ')}, which ${unknown.length > 1 ? 'are' : 'is'} not in the corpus. Cite only ids you were shown.`,
      ),
    )
  }

  const known = ids.filter((id) => corpus.has(id))
  if (known.length > 0 && !corpus.supportsQuoteAcross(known, claim.citation.quote)) {
    const cited = corpus.get(known[0])
    out.push(
      v(
        'QUOTE_MISMATCH',
        claim.id,
        `${claim.label} quotes "${truncate(claim.citation.quote, 90)}" but ${known.join(', ')} does not contain that text. ` +
          `${known[0]} says: "${truncate(cited?.text ?? '', 120)}". Quote verbatim or cite the unit that really says it.`,
      ),
    )
  }

  return out
}

function checkPlaceholders(claims: Claim[]): Violation[] {
  return claims
    .filter((c) => PLACEHOLDER_RE.test(c.text))
    .map((c) => v('PLACEHOLDER', c.id, `${c.label} contains placeholder text: "${truncate(c.text, 100)}". Write the real content.`))
}

function checkDuplicateIds(ids: string[], label: string): Violation[] {
  const seen = new Set<string>()
  const dupes = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id)
    seen.add(id)
  }
  return [...dupes].map((d) => v('DUPLICATE_ID', d, `${label} id "${d}" is used more than once; cross-references become ambiguous.`))
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s)

// ---------------------------------------------------------------------------

/** Citation checking for the raw extraction stage, before a brief exists. */
export function validateSignals(signals: Signal[], corpus: Corpus): Violation[] {
  const out: Violation[] = []
  for (const s of signals) {
    out.push(
      ...checkCitation({ id: s.id, label: `Signal ${s.id} (${s.type})`, text: s.statement, citation: s.citation }, corpus),
    )
    if (PLACEHOLDER_RE.test(s.statement)) {
      out.push(v('PLACEHOLDER', s.id, `Signal ${s.id} contains placeholder text.`))
    }
  }
  out.push(...checkDuplicateIds(signals.map((s) => s.id), 'Signal'))
  return out
}

export function validateBrief(brief: Brief, corpus: Corpus, conflicts: Conflict[] = []): Violation[] {
  const out: Violation[] = []
  const claims = claimsOf(brief)

  for (const c of claims) out.push(...checkCitation(c, corpus))
  out.push(...checkPlaceholders(claims))
  if (PLACEHOLDER_RE.test(brief.executiveSummary)) {
    out.push(v('PLACEHOLDER', 'executiveSummary', 'The executive summary contains placeholder text.'))
  }

  out.push(...checkDuplicateIds(brief.requirements.map((r) => r.id), 'Requirement'))
  out.push(...checkDuplicateIds(brief.painPoints.map((p) => p.id), 'Pain point'))

  if (brief.goal.statement.trim().length < 10) {
    out.push(v('EMPTY_SECTION', 'goal', 'The brief has no goal. Every other section depends on it.'))
  }
  if (brief.requirements.length === 0) {
    out.push(v('EMPTY_SECTION', 'requirements', 'The brief lists no requirements, which cannot be right for a real corpus.'))
  }
  if (brief.painPoints.length === 0) {
    out.push(v('EMPTY_SECTION', 'painPoints', 'The brief lists no pain points. A client with no problems does not commission work.', 'WARN'))
  }
  if (brief.currentProcess.length === 0) {
    out.push(v('EMPTY_SECTION', 'currentProcess', 'The brief describes no current process, so there is nothing to improve on.', 'WARN'))
  }

  // A contradiction the brief noticed but asked nothing about is worse than one
  // it missed: it looks handled.
  const raised = new Set(brief.openQuestions.map((q) => q.raisedByConflictId).filter(Boolean))
  for (const c of conflicts) {
    if (!raised.has(c.id)) {
      out.push(
        v(
          'UNRESOLVED_CONFLICT',
          c.id,
          `Sources disagree about ${c.subject} ("${truncate(c.sideA.claim, 60)}" vs "${truncate(c.sideB.claim, 60)}") ` +
            `but no open question asks the client to settle it. Add one with raisedByConflictId "${c.id}".`,
          c.severity === 'MINOR' ? 'WARN' : 'ERROR',
        ),
      )
    }
  }

  return out
}

export function validateBlueprint(bp: Blueprint, brief: Brief): Violation[] {
  const out: Violation[] = []
  const reqIds = new Set(brief.requirements.map((r) => r.id))
  const painIds = new Set(brief.painPoints.map((p) => p.id))
  const roleIds = new Set(bp.roles.map((r) => r.id))
  const screenIds = new Set(bp.screens.map((s) => s.id))
  const featureIds = new Set(bp.features.map((f) => f.id))

  out.push(...checkDuplicateIds(bp.features.map((f) => f.id), 'Feature'))
  out.push(...checkDuplicateIds(bp.roles.map((r) => r.id), 'Role'))
  out.push(...checkDuplicateIds(bp.screens.map((s) => s.id), 'Screen'))

  // Scope the client never asked for is how a fixed-price engagement loses money.
  for (const f of bp.features) {
    const unknown = f.requirementIds.filter((id) => !reqIds.has(id))
    if (unknown.length === f.requirementIds.length) {
      out.push(
        v(
          'ORPHAN_FEATURE',
          f.id,
          `Feature "${f.name}" traces to ${unknown.join(', ')}, none of which are requirements in the brief. ` +
            `Either map it to a real requirement id or drop it — invented scope is how fixed-price work loses money.`,
        ),
      )
    } else if (unknown.length > 0) {
      out.push(v('DANGLING_REFERENCE', f.id, `Feature "${f.name}" references unknown requirement ${unknown.join(', ')}.`, 'WARN'))
    }
  }

  // A pain point nothing addresses means the proposal misses the point.
  const addressed = new Set(bp.toBeProcess.flatMap((s) => s.resolvesPainIds))
  for (const p of brief.painPoints) {
    if (!addressed.has(p.id)) {
      out.push(
        v(
          'UNADDRESSED_PAIN',
          p.id,
          `Pain point ${p.id} ("${truncate(p.statement, 70)}", impact ${p.impact}) is not resolved by any step of the proposed process.`,
          p.impact === 'HIGH' ? 'ERROR' : 'WARN',
        ),
      )
    }
  }

  for (const s of bp.toBeProcess) {
    const unknown = s.resolvesPainIds.filter((id) => !painIds.has(id))
    if (unknown.length) {
      out.push(v('DANGLING_REFERENCE', `step-${s.step}`, `To-be step ${s.step} claims to resolve unknown pain ${unknown.join(', ')}.`))
    }
  }

  for (const s of bp.screens) {
    const unknownRoles = s.roleIds.filter((id) => !roleIds.has(id))
    if (unknownRoles.length) {
      out.push(v('ROLE_UNDEFINED', s.id, `Screen "${s.name}" is assigned to role ${unknownRoles.join(', ')}, which is not defined.`))
    }
    const unknownFeatures = s.featureIds.filter((id) => !featureIds.has(id))
    if (unknownFeatures.length) {
      out.push(v('DANGLING_REFERENCE', s.id, `Screen "${s.name}" references unknown feature ${unknownFeatures.join(', ')}.`, 'WARN'))
    }
  }

  for (const f of bp.flow) {
    for (const [side, sid] of [['from', f.fromScreenId], ['to', f.toScreenId]] as const) {
      if (!screenIds.has(sid)) {
        out.push(v('DANGLING_REFERENCE', sid, `Flow ${f.fromScreenId}→${f.toScreenId} has a ${side} screen that does not exist.`))
      }
    }
  }

  if (bp.features.length === 0) out.push(v('EMPTY_SECTION', 'features', 'The blueprint proposes no features.'))
  if (bp.screens.length === 0) out.push(v('EMPTY_SECTION', 'screens', 'The blueprint proposes no screens.'))

  return out
}

export function validateAppSpec(spec: AppSpec, bp: Blueprint): Violation[] {
  const out: Violation[] = []
  const screenIds = new Set(spec.screens.map((s) => s.id))
  const roleIds = new Set(spec.roles.map((r) => r.id))
  const bpRoleNames = new Set(bp.roles.map((r) => r.name.toLowerCase()))

  out.push(...checkDuplicateIds(spec.screens.map((s) => s.id), 'Screen'))
  out.push(...checkDuplicateIds(spec.roles.map((r) => r.id), 'Role'))

  const badTarget = (from: string, target: string | null, what: string) =>
    target && !screenIds.has(target)
      ? [v('DANGLING_REFERENCE', from, `${what} navigates to "${target}", which is not a screen in this spec. The button would do nothing.`)]
      : []

  for (const s of spec.screens) {
    const unknown = s.roleIds.filter((id) => !roleIds.has(id))
    if (unknown.length) {
      out.push(v('ROLE_UNDEFINED', s.id, `Screen "${s.name}" is visible to role ${unknown.join(', ')}, which is not in the roles list. The role switcher would hide it permanently.`))
    }

    for (const b of s.blocks) {
      if (b.kind === 'table') out.push(...badTarget(s.id, b.rowActionTarget, `Table "${b.title}"`))
      if (b.kind === 'form') out.push(...badTarget(s.id, b.submitTarget, `Form "${b.title}"`))
      if (b.kind === 'detail') {
        for (const a of b.actions) out.push(...badTarget(s.id, a.target, `Action "${a.label}"`))
      }
      if (b.kind === 'table') {
        const width = b.columns.length
        const ragged = b.rows.filter((r) => r.length !== width).length
        if (ragged) {
          out.push(v('DANGLING_REFERENCE', s.id, `Table "${b.title}" has ${width} columns but ${ragged} row(s) with a different cell count; the table would render misaligned.`))
        }
        if (b.statusColumn !== null && (b.statusColumn < 0 || b.statusColumn >= width)) {
          out.push(v('DANGLING_REFERENCE', s.id, `Table "${b.title}" marks column ${b.statusColumn} as the status column but only has ${width} columns.`, 'WARN'))
        }
      }
    }

    if (PLACEHOLDER_RE.test(JSON.stringify(s))) {
      out.push(v('PLACEHOLDER', s.id, `Screen "${s.name}" contains placeholder text. Seed data must use entities from the client's own corpus.`))
    }
  }

  // Roles in the POC should be the roles the blueprint identified, not new ones.
  for (const r of spec.roles) {
    if (!bpRoleNames.has(r.name.toLowerCase())) {
      out.push(v('DANGLING_REFERENCE', r.id, `POC role "${r.name}" does not correspond to any role in the blueprint.`, 'WARN'))
    }
  }

  // A POC where nothing leads anywhere is a mockup, not a prototype.
  const anyNav = spec.screens.some((s) =>
    s.blocks.some(
      (b) =>
        (b.kind === 'table' && b.rowActionTarget) ||
        (b.kind === 'form' && b.submitTarget) ||
        (b.kind === 'detail' && b.actions.some((a) => a.target)),
    ),
  )
  if (!anyNav && spec.screens.length > 1) {
    out.push(v('EMPTY_SECTION', 'flow', 'No block navigates to another screen, so the prototype cannot be clicked through. Give at least one table or action a target.'))
  }

  return out
}

/**
 * Renders violations as an instruction for the next attempt.
 *
 * Written as imperatives with the claim id attached, because this text is fed
 * back verbatim as the retry prompt. "Fix these and change nothing else" matters:
 * without it the model rewrites the whole document and introduces new errors
 * while fixing the old ones.
 */
export function toFeedback(violations: Violation[], attempt: number): string {
  const errs = violations.filter((x) => x.severity === 'ERROR')
  const warns = violations.filter((x) => x.severity === 'WARN')

  const lines = [
    `Attempt ${attempt} was rejected by automated verification.`,
    '',
    'Fix exactly these problems and change nothing else. Keep every other claim, id and citation identical:',
    '',
    ...errs.map((x, i) => `${i + 1}. [${x.code}] ${x.detail}`),
  ]
  if (warns.length) {
    lines.push('', 'Also worth addressing if you can do so without altering anything else:', ...warns.map((x) => `- [${x.code}] ${x.detail}`))
  }
  return lines.join('\n')
}
