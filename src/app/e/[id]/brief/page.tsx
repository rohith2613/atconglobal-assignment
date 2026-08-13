import Link from 'next/link'
import { repo } from '@/lib/db/repo'
import type { Brief } from '@/lib/schema/brief'
import type { Conflict } from '@/lib/schema/signals'
import type { GapRow } from '@/lib/schema/gaps'
import type { Violation } from '@/lib/verify/types'
import { Claim } from '@/components/Claim'
import { Badge, Confidence, CopyButton, Empty, Flag, Label, SectionHead } from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function BriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const brief = repo.getArtifact<Brief>(id, 'brief')
  const conflicts = repo.getArtifact<{ conflicts: Conflict[] }>(id, 'reconciled')?.conflicts ?? []
  const gaps = repo.getArtifact<GapRow[]>(id, 'gaps') ?? []
  const review = repo.getArtifact<{ needsHumanReview: string[]; violations: Violation[] }>(id, 'review')
  const overrides = repo.getClaimOverrides(id)

  if (!brief) {
    return (
      <div className="mx-auto max-w-[980px] px-8 py-8">
        <Empty
          title="No brief yet"
          hint="Add the client's material and run the analysis. The brief is written from what the sources actually say, and every claim in it will carry a citation."
          action={
            <Link href={`/e/${id}/sources`} className="ap text-[var(--teal-300)] underline underline-offset-4">
              Go to sources
            </Link>
          }
        />
      </div>
    )
  }

  const flagged = review?.needsHumanReview.includes('synthesize')
  const briefViolations = (review?.violations ?? []).filter((v) => v.severity === 'ERROR')
  const musts = brief.requirements.filter((r) => r.moscow === 'MUST')
  const rest = brief.requirements.filter((r) => r.moscow !== 'MUST')

  return (
    <div className="mx-auto max-w-[980px] px-8 py-8">
      <header className="mb-7">
        <div className="mb-1.5 flex flex-wrap items-baseline gap-3">
          <h1>Discovery brief</h1>
          <span className="ap-lg">what the client needs</span>
        </div>
        <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-[var(--paper-400)]">
          Written only from the client&rsquo;s own material. Every claim carries a citation — click one to turn to
          the passage it came from.
        </p>
      </header>

      {flagged && (
        <div className="panel mb-6 border-[color-mix(in_srgb,var(--flag-amber)_32%,transparent)] bg-[color-mix(in_srgb,var(--flag-amber)_9%,transparent)] p-4">
          <p className="ap mb-1 text-[var(--flag-amber)]">⚑ Needs human review</p>
          <p className="text-[13px] leading-relaxed text-[var(--paper-200)]">
            The verification loop could not clear this brief within its retries, so it is shown flagged rather than
            presented as clean. {briefViolations.length > 0 && `${briefViolations.length} check${briefViolations.length === 1 ? '' : 's'} still failing:`}
          </p>
          {briefViolations.slice(0, 4).map((v, i) => (
            <p key={i} className="note mt-1 text-[var(--paper-400)]">
              <span className="text-[var(--flag-amber)]">{v.code}</span> · {v.detail}
            </p>
          ))}
        </div>
      )}

      <section className="panel mb-7 p-5">
        <Label className="mb-2">In one paragraph</Label>
        <p className="prose-client">{brief.executiveSummary}</p>
      </section>

      <section className="mb-8">
        <SectionHead n="A" title="The goal" />
        <Claim
          id="goal"
          engagementId={id}
          citation={brief.goal.citation}
          label="The goal"
          override={overrides.goal}
        >
          {brief.goal.statement}
        </Claim>
      </section>

      <section className="mb-8">
        <SectionHead n="B" title="How it works today" count={brief.currentProcess.length} />
        <ol>
          {brief.currentProcess.map((s) => (
            <li key={s.step}>
              <Claim
                id={`step-${s.step}`}
                engagementId={id}
                citation={s.citation}
                label={`Step ${s.step} — ${s.name}`}
                override={overrides[`step-${s.step}`]}
                marginalia={
                  <>
                    <span className="ap">{s.actor}</span>
                    {s.isBottleneck && <Badge tone="amber">⧗ waits here</Badge>}
                  </>
                }
              >
                <span className="tabular mr-2 font-[family-name:var(--mono)] text-[13px] text-[var(--paper-500)]">
                  {String(s.step).padStart(2, '0')}
                </span>
                <strong className="font-semibold">{s.name}.</strong> {s.detail}
              </Claim>
            </li>
          ))}
        </ol>
      </section>

      <section className="mb-8">
        <SectionHead n="C" title="What it costs them" count={brief.painPoints.length} />
        {[...brief.painPoints]
          .sort((a, b) => rank(b.impact) - rank(a.impact))
          .map((p) => (
            <Claim
              key={p.id}
              id={p.id}
              engagementId={id}
              citation={p.citation}
              label={`Pain point ${p.id}`}
              override={overrides[p.id]}
              marginalia={
                <>
                  <Flag level={p.impact.toLowerCase() as 'high' | 'medium' | 'low'} />
                  <Confidence level={p.confidence} />
                  <span className="ap max-w-[160px] truncate text-right">{p.affects}</span>
                </>
              }
            >
              {p.statement}
            </Claim>
          ))}
      </section>

      <section className="mb-8">
        <SectionHead
          n="D"
          title="What the solution must do"
          count={brief.requirements.length}
          right={
            <CopyButton
              label="Copy requirements"
              text={brief.requirements.map((r) => `${r.id} [${r.moscow}] ${r.statement}`).join('\n')}
            />
          }
        />

        <Label className="mb-1 mt-3">Must have</Label>
        {musts.map((r) => (
          <RequirementClaim key={r.id} r={r} id={id} override={overrides[r.id]} />
        ))}

        {rest.length > 0 && (
          <>
            <Label className="mb-1 mt-5">Should, could, and explicitly not</Label>
            {rest.map((r) => (
              <RequirementClaim key={r.id} r={r} id={id} override={overrides[r.id]} />
            ))}
          </>
        )}
      </section>

      {brief.constraints.length > 0 && (
        <section className="mb-8">
          <SectionHead n="E" title="What limits the solution" count={brief.constraints.length} />
          {brief.constraints.map((c) => (
            <Claim
              key={c.id}
              id={c.id}
              engagementId={id}
              citation={c.citation}
              label={`Constraint ${c.id}`}
              override={overrides[c.id]}
            >
              {c.statement}
            </Claim>
          ))}
        </section>
      )}

      <section className="mb-8 grid gap-6 md:grid-cols-2">
        <div>
          <SectionHead n="F" title="Who is involved" count={brief.stakeholders.length} />
          <ul className="flex flex-col gap-1">
            {brief.stakeholders.map((s, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 py-1">
                <span className="text-[13.5px] text-[var(--paper-100)]">{s.name}</span>
                <span className="ap flex-1 truncate text-right">{s.role}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <SectionHead n="G" title="What they run today" count={brief.systems.length} />
          <ul className="flex flex-col gap-1">
            {brief.systems.map((s, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 py-1">
                <span className="text-[13.5px] text-[var(--paper-100)]">{s.name}</span>
                <span className="ap flex-1 truncate text-right">{s.role}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mb-6">
        <SectionHead
          n="H"
          title="What we still need to ask"
          count={brief.openQuestions.length}
          right={
            <CopyButton
              label="Copy all"
              text={brief.openQuestions.map((q, i) => `${i + 1}. ${q.question}`).join('\n\n')}
            />
          }
        />
        <ol className="flex flex-col gap-2">
          {brief.openQuestions.map((q, i) => {
            const conflict = conflicts.find((c) => c.id === q.raisedByConflictId)
            return (
              <li key={q.id} className="panel px-4 py-3">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="ap tabular">{String(i + 1).padStart(2, '0')}</span>
                  {conflict ? (
                    <Link href={`/e/${id}/conflicts`}>
                      <Badge tone="red">⚠ sources disagree — {conflict.subject}</Badge>
                    </Link>
                  ) : (
                    <Badge tone="violet">gap in the pack</Badge>
                  )}
                </div>
                <p className="prose-client text-[15px]">{q.question}</p>
                <p className="note mt-1.5 text-[var(--paper-400)]">{q.why}</p>
              </li>
            )
          })}
        </ol>
        {gaps.filter((g) => g.status === 'MISSING').length > 0 && (
          <p className="mt-3 text-[12.5px] text-[var(--paper-400)]">
            <Link href={`/e/${id}/gaps`} className="text-[var(--teal-300)] underline underline-offset-4">
              The gap radar
            </Link>{' '}
            has {gaps.filter((g) => g.status === 'MISSING').length} further checklist items the pack does not
            address at all.
          </p>
        )}
      </section>
    </div>
  )
}

const rank = (i: string) => (i === 'HIGH' ? 3 : i === 'MEDIUM' ? 2 : 1)

function RequirementClaim({
  r,
  id,
  override,
}: {
  r: Brief['requirements'][number]
  id: string
  override?: import('@/lib/types').ClaimOverride
}) {
  return (
    <Claim
      id={r.id}
      engagementId={id}
      citation={r.citation}
      label={`Requirement ${r.id}`}
      override={override}
      marginalia={
        <>
          <Badge tone={r.moscow === 'MUST' ? 'teal' : r.moscow === 'WONT' ? 'red' : 'neutral'}>{r.moscow}</Badge>
          <Confidence level={r.confidence} />
        </>
      }
    >
      {r.statement}
    </Claim>
  )
}
