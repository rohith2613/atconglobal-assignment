import { repo } from '@/lib/db/repo'
import { STAGE_LABEL, type Stage } from '@/lib/pipeline/events'
import type { Violation } from '@/lib/verify/types'
import { Badge, Empty, Label, SectionHead } from '@/components/ui'

export const dynamic = 'force-dynamic'

/**
 * What the run actually did.
 *
 * Every claim elsewhere in this application is only as good as the process that
 * produced it, and this is that process with nothing hidden: every call, every
 * retry, what each one cost, and what the loop rejected. A system that says it
 * verifies its own output should be willing to show the receipts.
 */
export default async function TracePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const trace = repo.getTrace(id)
  const review = repo.getArtifact<{ needsHumanReview: string[]; violations: Violation[] }>(id, 'review')
  const run = repo.latestRun(id)

  if (trace.length === 0) {
    return (
      <div className="mx-auto max-w-[1180px] px-8 py-8">
        <Empty
          title="Nothing to show yet"
          hint="Run the analysis. Every model call is recorded here with its tokens, cost, latency and verdict — including the ones that were rejected and regenerated."
        />
      </div>
    )
  }

  const total = {
    calls: trace.length,
    in: trace.reduce((a, t) => a + t.promptTokens, 0),
    out: trace.reduce((a, t) => a + t.completionTokens, 0),
    usd: trace.reduce((a, t) => a + t.costUsd, 0),
    ms: trace.reduce((a, t) => a + t.latencyMs, 0),
    retries: trace.filter((t) => t.attempt > 1).length,
    failed: trace.filter((t) => !t.ok).length,
  }

  const stages = [...new Set(trace.map((t) => t.stage))] as Stage[]
  const byStage = stages.map((s) => {
    const rows = trace.filter((t) => t.stage === s)
    return {
      stage: s,
      calls: rows.length,
      usd: rows.reduce((a, t) => a + t.costUsd, 0),
      ms: rows.reduce((a, t) => a + t.latencyMs, 0),
      retries: rows.filter((t) => t.attempt > 1).length,
    }
  })

  const errors = (review?.violations ?? []).filter((v) => v.severity === 'ERROR')

  return (
    <div className="mx-auto max-w-[1180px] px-8 py-8">
      <header className="mb-6">
        <div className="mb-1.5 flex flex-wrap items-baseline gap-3">
          <h1>Run trace</h1>
          <span className="ap-lg">how this was produced</span>
        </div>
        <p className="max-w-[74ch] text-[13.5px] leading-relaxed text-[var(--paper-400)]">
          Every model call, including the ones that were rejected and regenerated. A system that claims to verify
          its own output should be willing to show what that cost and what it caught.
        </p>
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile v={String(total.calls)} label="calls" />
        <Tile v={`${(total.in / 1000).toFixed(1)}k`} label="tokens in" />
        <Tile v={`${(total.out / 1000).toFixed(1)}k`} label="tokens out" />
        <Tile v={`$${total.usd.toFixed(3)}`} label="cost" />
        <Tile v={`${Math.round(total.ms / 1000)}s`} label="model time" />
        <Tile v={String(total.retries)} label="retries" tone={total.retries > 0 ? 'amber' : undefined} />
      </div>

      {review && review.needsHumanReview.length > 0 && (
        <section className="panel mb-6 border-[color-mix(in_srgb,var(--flag-amber)_32%,transparent)] bg-[color-mix(in_srgb,var(--flag-amber)_8%,transparent)] p-4">
          <p className="ap mb-1.5 text-[var(--flag-amber)]">⚑ Exhausted retries and shipped flagged</p>
          <p className="mb-2 text-[13px] leading-relaxed text-[var(--paper-200)]">
            {review.needsHumanReview.map((s) => STAGE_LABEL[s as Stage] ?? s).join(' and ')} could not be cleared
            within the attempt budget. The best attempt is shown throughout the application rather than the last —
            a model told to fix three things will sometimes fix two and break a fourth.
          </p>
          {errors.slice(0, 6).map((v, i) => (
            <p key={i} className="note mt-1">
              <span className="text-[var(--flag-amber)]">{v.code}</span>{' '}
              <span className="text-[var(--teal-600)]">{v.claimId}</span> · {v.detail}
            </p>
          ))}
        </section>
      )}

      <section className="mb-7">
        <SectionHead title="By stage" count={byStage.length} />
        <div className="panel overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-[var(--ink-600)]">
                <Th>stage</Th>
                <Th right>calls</Th>
                <Th right>retries</Th>
                <Th right>time</Th>
                <Th right>cost</Th>
                <Th right>share</Th>
              </tr>
            </thead>
            <tbody>
              {byStage.map((s) => (
                <tr key={s.stage} className="border-b border-[var(--ink-700)] last:border-0">
                  <td className="px-3 py-1.5 text-[var(--paper-100)]">{STAGE_LABEL[s.stage] ?? s.stage}</td>
                  <Td>{s.calls}</Td>
                  <Td tone={s.retries > 0 ? 'amber' : undefined}>{s.retries || '—'}</Td>
                  <Td>{(s.ms / 1000).toFixed(1)}s</Td>
                  <Td>${s.usd.toFixed(4)}</Td>
                  <Td>{total.usd > 0 ? `${Math.round((s.usd / total.usd) * 100)}%` : '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <SectionHead
          title="Every call"
          count={trace.length}
          right={
            run?.finishedAt ? (
              <span className="ap">
                finished {new Date(run.finishedAt).toLocaleString('en-GB')} · {run.status.toLowerCase()}
              </span>
            ) : undefined
          }
        />
        <div className="panel overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-[var(--ink-600)]">
                <Th>#</Th>
                <Th>stage</Th>
                <Th>role</Th>
                <Th>model</Th>
                <Th right>in</Th>
                <Th right>out</Th>
                <Th right>ms</Th>
                <Th right>cost</Th>
                <Th>att</Th>
                <Th>what</Th>
              </tr>
            </thead>
            <tbody>
              {trace.map((t, i) => (
                <tr
                  key={t.id}
                  className={
                    !t.ok
                      ? 'border-b border-[var(--ink-700)] bg-[color-mix(in_srgb,var(--flag-red)_9%,transparent)]'
                      : t.attempt > 1
                        ? 'border-b border-[var(--ink-700)] bg-[color-mix(in_srgb,var(--flag-amber)_7%,transparent)]'
                        : 'border-b border-[var(--ink-700)] last:border-0'
                  }
                >
                  <td className="px-2 py-1 text-[var(--paper-500)]">{i + 1}</td>
                  <td className="px-2 py-1 text-[var(--paper-200)]">{t.stage}</td>
                  <td className="px-2 py-1">
                    <span className="id">{t.role}</span>
                  </td>
                  <td className="px-2 py-1">
                    <span className="id">{t.model}</span>
                  </td>
                  <Td>{t.promptTokens.toLocaleString()}</Td>
                  <Td>{t.completionTokens.toLocaleString()}</Td>
                  <Td>{t.latencyMs.toLocaleString()}</Td>
                  <Td>${t.costUsd.toFixed(5)}</Td>
                  <td className="px-2 py-1">
                    {t.attempt > 1 ? <Badge tone="amber">{t.attempt}</Badge> : <span className="text-[var(--ink-400)]">1</span>}
                  </td>
                  <td className="max-w-[280px] truncate px-2 py-1 text-[var(--paper-400)]" title={t.error ?? t.summary}>
                    {t.ok ? t.summary : <span className="text-[var(--flag-red)]">{t.error}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {total.retries > 0 && (
          <p className="mt-3 max-w-[74ch] text-[12.5px] leading-relaxed text-[var(--paper-400)]">
            <span className="text-[var(--flag-amber)]">Amber rows are regenerations.</span> Each one is an output
            that failed a deterministic check — usually a quote that did not appear in the evidence it cited — and
            was rewritten with the failure as the instruction. Those are the calls that make the rest trustworthy.
          </p>
        )}
      </section>
    </div>
  )
}

function Tile({ v, label, tone }: { v: string; label: string; tone?: 'amber' }) {
  return (
    <div className="panel px-3.5 py-2.5">
      <p
        className="tabular font-[family-name:var(--mono)] text-[19px] leading-tight"
        style={{ color: tone === 'amber' ? 'var(--flag-amber)' : 'var(--paper-100)' }}
      >
        {v}
      </p>
      <Label className="mt-0.5">{label}</Label>
    </div>
  )
}

const Th = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
  <th className={`px-2 py-1.5 ${right ? 'text-right' : 'text-left'}`}>
    <span className="ap">{children}</span>
  </th>
)

const Td = ({ children, tone }: { children: React.ReactNode; tone?: 'amber' }) => (
  <td
    className="tabular px-2 py-1 text-right font-[family-name:var(--mono)]"
    style={{ color: tone === 'amber' ? 'var(--flag-amber)' : 'var(--paper-300)' }}
  >
    {children}
  </td>
)
