import { repo } from '@/lib/db/repo'
import type { Brief } from '@/lib/schema/brief'
import type { Blueprint, Disposition } from '@/lib/schema/blueprint'
import { DISPOSITION_MEANING } from '@/lib/schema/blueprint'
import { asIsDiagram, toBeDiagram } from '@/lib/pipeline/blueprint'
import { Mermaid } from '@/components/Mermaid'
import { Cite } from '@/components/Evidence'
import { Badge, Empty, Label, SectionHead } from '@/components/ui'

export const dynamic = 'force-dynamic'

/** Shape as well as colour — a disposition must survive being printed. */
const GLYPH: Record<Disposition, string> = {
  KEEP: '▢',
  SIMPLIFY: '◇',
  AUTOMATE: '⧉',
  ELIMINATE: '⊘',
}

const TONE: Record<Disposition, 'neutral' | 'teal' | 'green' | 'red'> = {
  KEEP: 'neutral',
  SIMPLIFY: 'teal',
  AUTOMATE: 'green',
  ELIMINATE: 'red',
}

export default async function ProcessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const brief = repo.getArtifact<Brief>(id, 'brief')
  const bp = repo.getArtifact<Blueprint>(id, 'blueprint')

  if (!brief || !bp) {
    return (
      <div className="mx-auto max-w-[1100px] px-8 py-8">
        <Empty
          title="No process design yet"
          hint="Run the analysis. Each step of how the client works today is classified — keep it, simplify it, automate it, or remove it — with the reason and the pain point it resolves."
        />
      </div>
    )
  }

  const painById = new Map(brief.painPoints.map((p) => [p.id, p]))
  const counts = (Object.keys(GLYPH) as Disposition[]).map((d) => ({
    d,
    n: bp.toBeProcess.filter((s) => s.disposition === d).length,
  }))

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-8">
      <header className="mb-7">
        <div className="mb-1.5 flex flex-wrap items-baseline gap-3">
          <h1>As-is / To-be</h1>
          <span className="ap-lg">a better way of working</span>
        </div>
        <p className="max-w-[70ch] text-[13.5px] leading-relaxed text-[var(--paper-400)]">{bp.summary}</p>
      </header>

      <div className="mb-7 grid gap-5 lg:grid-cols-2">
        <section>
          <SectionHead title="How it works today" count={brief.currentProcess.length} />
          <div className="panel p-4">
            <Mermaid id="asis" chart={asIsDiagram(brief)} />
          </div>
          <p className="ap mt-2">Amber marks a step where work visibly waits.</p>
        </section>

        <section>
          <SectionHead title="How it would work" count={bp.toBeProcess.length} />
          <div className="panel p-4">
            <Mermaid id="tobe" chart={toBeDiagram(bp)} />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {counts.map(({ d, n }) => (
              <Badge key={d} tone={TONE[d]} title={DISPOSITION_MEANING[d]}>
                <span aria-hidden>{GLYPH[d]}</span>
                {d} {n}
              </Badge>
            ))}
          </div>
        </section>
      </div>

      <SectionHead title="Every step, and what happens to it" count={bp.toBeProcess.length} />

      <ol className="mb-8 flex flex-col gap-px overflow-hidden rounded-[var(--radius)] border border-[var(--ink-600)] bg-[var(--ink-600)]">
        {[...bp.toBeProcess]
          .sort((a, b) => a.step - b.step)
          .map((s) => {
            const replaced = s.replacesAsIsStep
              ? brief.currentProcess.find((c) => c.step === s.replacesAsIsStep)
              : undefined
            return (
              <li key={s.step} className="bg-[var(--ink-800)] px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
                  <span className="ap tabular w-[20px] shrink-0">{String(s.step).padStart(2, '0')}</span>
                  <span className="min-w-[200px] flex-1 text-[14px] text-[var(--paper-100)]">{s.name}</span>
                  <span className="ap">{s.actor}</span>
                  <Badge tone={TONE[s.disposition]} title={DISPOSITION_MEANING[s.disposition]}>
                    <span aria-hidden>{GLYPH[s.disposition]}</span>
                    {s.disposition}
                  </Badge>
                </div>

                <p className="mt-1.5 max-w-[80ch] text-[13px] leading-relaxed text-[var(--paper-300)]">
                  {s.rationale}
                </p>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                  {replaced && (
                    <span className="ap normal-case tracking-normal">
                      replaces today&rsquo;s step {replaced.step}, “{replaced.name}”
                    </span>
                  )}
                  {s.resolvesPainIds.length > 0 && (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="ap">resolves</span>
                      {s.resolvesPainIds.map((pid) => {
                        const p = painById.get(pid)
                        return (
                          <span key={pid} className="flex items-center">
                            <Badge tone="amber" title={p?.statement}>
                              {pid}
                            </Badge>
                            {p && <Cite evidenceIds={p.citation.evidenceIds} quote={p.citation.quote} label={p.statement} />}
                          </span>
                        )
                      })}
                    </span>
                  )}
                </div>
              </li>
            )
          })}
      </ol>

      {bp.outOfScope.length > 0 && (
        <section>
          <SectionHead title="Deliberately not doing" count={bp.outOfScope.length} />
          <p className="ap mb-2 normal-case tracking-normal">
            Considered and left out, so the client can see it was weighed rather than missed.
          </p>
          <ul className="flex flex-col gap-1.5">
            {bp.outOfScope.map((o, i) => (
              <li key={i} className="panel px-4 py-2.5">
                <p className="text-[13.5px] text-[var(--paper-100)]">{o.item}</p>
                <p className="ap mt-0.5 normal-case tracking-normal">{o.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <Label className="mb-2">What the dispositions mean</Label>
        <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {(Object.keys(DISPOSITION_MEANING) as Disposition[]).map((d) => (
            <div key={d} className="flex items-baseline gap-2">
              <Badge tone={TONE[d]}>
                <span aria-hidden>{GLYPH[d]}</span>
                {d}
              </Badge>
              <dd className="text-[12.5px] text-[var(--paper-400)]">{DISPOSITION_MEANING[d]}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}
