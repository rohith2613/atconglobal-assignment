import { repo } from '@/lib/db/repo'
import type { GapRow } from '@/lib/schema/gaps'
import { clientQuestionList, coverageByDimension, coverageScore } from '@/lib/pipeline/gaps'
import { Cite } from '@/components/Evidence'
import { Badge, CopyButton, Empty, Label, Meter, SectionHead } from '@/components/ui'

export const dynamic = 'force-dynamic'

const STATUS = {
  COVERED: { tone: 'green' as const, glyph: '●', label: 'Answered' },
  PARTIAL: { tone: 'amber' as const, glyph: '◐', label: 'Partly' },
  MISSING: { tone: 'red' as const, glyph: '○', label: 'Not asked' },
}

export default async function GapsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gaps = repo.getArtifact<GapRow[]>(id, 'gaps') ?? []

  if (gaps.length === 0) {
    return (
      <div className="mx-auto max-w-[1020px] px-8 py-8">
        <Empty
          title="No coverage assessment yet"
          hint="Run the analysis. Every engagement is scored against the same 30 questions, so an absent dimension is impossible to overlook — the row is there whether the sources mention it or not."
        />
      </div>
    )
  }

  const score = coverageScore(gaps)
  const byDim = coverageByDimension(gaps)
  const questions = clientQuestionList(gaps)

  return (
    <div className="mx-auto max-w-[1020px] px-8 py-8">
      <header className="mb-7">
        <div className="mb-1.5 flex flex-wrap items-baseline gap-3">
          <h1>Gap radar</h1>
          <span className="ap-lg">what nobody has asked yet</span>
        </div>
        <p className="max-w-[70ch] text-[13.5px] leading-relaxed text-[var(--paper-400)]">
          The same 30 questions are scored for every engagement, so coverage is comparable between runs and an
          entire missing dimension cannot slip past. The value here is not the score — it is the list of questions
          at the bottom, written to be sent as they are.
        </p>
      </header>

      <section className="panel mb-6 p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Label>Discovery coverage</Label>
            <p className="tabular mt-1 font-[family-name:var(--mono)] text-[38px] leading-none text-[var(--paper-100)]">
              {score.pct}
              <span className="text-[20px] text-[var(--paper-400)]">%</span>
            </p>
          </div>
          <div className="flex gap-5">
            <Count n={score.covered} label="answered" tone="green" />
            <Count n={score.partial} label="partly" tone="amber" />
            <Count n={score.missing} label="not asked" tone="red" />
          </div>
        </div>

        <div className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
          {byDim.map((d) => (
            <div key={d.dimension}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-[12.5px] text-[var(--paper-200)]">{d.dimension}</span>
                <span className="ap tabular">
                  {d.pct}%{d.missing > 0 && <span className="text-[var(--flag-red)]"> · {d.missing} unasked</span>}
                </span>
              </div>
              <Meter pct={d.pct} tone={d.pct >= 70 ? 'green' : d.pct >= 40 ? 'amber' : 'red'} />
            </div>
          ))}
        </div>
      </section>

      <SectionHead title="Every question, scored" count={gaps.length} />

      <ul className="mb-8 flex flex-col gap-px overflow-hidden rounded-[var(--radius)] border border-[var(--ink-600)] bg-[var(--ink-600)]">
        {gaps.map((g) => {
          const s = STATUS[g.status]
          return (
            <li key={g.questionId} className="bg-[var(--ink-800)] px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="id w-[30px] shrink-0 text-[var(--teal-600)]">{g.questionId}</span>
                <span className="min-w-[240px] flex-1 text-[13.5px] text-[var(--paper-100)]">{g.question}</span>
                <span className="ap w-[112px] shrink-0">{g.dimension}</span>
                <Badge tone={s.tone}>
                  <span aria-hidden>{s.glyph}</span>
                  {s.label}
                </Badge>
              </div>

              <p className="ap mt-1.5 normal-case tracking-normal text-[var(--paper-400)]">
                {g.evidenceSummary}
                {g.evidenceIds.length > 0 && (
                  <Cite evidenceIds={g.evidenceIds} label={`${g.questionId} — ${g.question}`} />
                )}
              </p>

              {g.clientQuestion && (
                <div className="mt-2 flex items-start gap-2 border-l-2 border-[var(--teal-600)] pl-3">
                  <p className="prose-client flex-1 text-[14px]">{g.clientQuestion}</p>
                  <CopyButton text={g.clientQuestion} label="Copy" />
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {questions && (
        <section className="panel p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <Label>Send to the client</Label>
              <p className="mt-0.5 text-[12.5px] text-[var(--paper-400)]">
                Everything unanswered, worst first, ready to paste into an email.
              </p>
            </div>
            <CopyButton text={questions} label="Copy all questions" size="md" />
          </div>
          <pre className="prose-client max-h-[340px] overflow-y-auto whitespace-pre-wrap rounded-[var(--radius)] border border-[var(--ink-600)] bg-[var(--ink-900)] p-4 text-[13.5px]">
            {questions}
          </pre>
        </section>
      )}
    </div>
  )
}

function Count({ n, label, tone }: { n: number; label: string; tone: 'green' | 'amber' | 'red' }) {
  const color =
    tone === 'green' ? 'var(--flag-green)' : tone === 'amber' ? 'var(--flag-amber)' : 'var(--flag-red)'
  return (
    <span className="flex flex-col items-end">
      <span className="tabular font-[family-name:var(--mono)] text-[19px]" style={{ color }}>
        {n}
      </span>
      <span className="ap text-[9px]">{label}</span>
    </span>
  )
}
