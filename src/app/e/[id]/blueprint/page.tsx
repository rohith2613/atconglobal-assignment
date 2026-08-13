import { repo } from '@/lib/db/repo'
import type { Brief } from '@/lib/schema/brief'
import type { Blueprint } from '@/lib/schema/blueprint'
import { traceabilityMatrix } from '@/lib/pipeline/blueprint'
import { Cite } from '@/components/Evidence'
import { Badge, Empty, Label, SectionHead } from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function BlueprintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const brief = repo.getArtifact<Brief>(id, 'brief')
  const bp = repo.getArtifact<Blueprint>(id, 'blueprint')

  if (!brief || !bp) {
    return (
      <div className="mx-auto max-w-[1100px] px-8 py-8">
        <Empty
          title="No blueprint yet"
          hint="Run the analysis. Every feature must trace to a requirement the client actually stated — a feature that traces to nothing is scope nobody asked for."
        />
      </div>
    )
  }

  const matrix = traceabilityMatrix(bp, brief)
  const byPriority = ['P0', 'P1', 'P2'] as const

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-8">
      <header className="mb-7">
        <div className="mb-1.5 flex flex-wrap items-baseline gap-3">
          <h1>Solution blueprint</h1>
          <span className="ap-lg">what to build</span>
        </div>
        <p className="max-w-[70ch] text-[13.5px] leading-relaxed text-[var(--paper-400)]">
          Features, the people who use them, and the screens they live on. The matrix at the bottom is the point:
          every feature traces back to a requirement, and every requirement forward to a feature — or it is called
          out as uncovered.
        </p>
      </header>

      <section className="mb-8">
        <SectionHead title="Features" count={bp.features.length} />
        {byPriority.map((p) => {
          const rows = bp.features.filter((f) => f.priority === p)
          if (rows.length === 0) return null
          return (
            <div key={p} className="mb-4">
              <Label className="mb-1.5">
                {p === 'P0' ? 'P0 — required for the first useful release' : p === 'P1' ? 'P1 — the next increment' : 'P2 — later'}
              </Label>
              <ul className="flex flex-col gap-1.5">
                {rows.map((f) => (
                  <li key={f.id} className="panel px-4 py-3">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="id w-[26px] shrink-0 text-[var(--teal-600)]">{f.id}</span>
                      <span className="min-w-[180px] flex-1 text-[14px] text-[var(--paper-100)]">{f.name}</span>
                      <Badge>{f.effort === 'S' ? 'small' : f.effort === 'M' ? 'medium' : 'large'}</Badge>
                      <span className="flex flex-wrap gap-1">
                        {f.requirementIds.map((rid) => {
                          const r = brief.requirements.find((x) => x.id === rid)
                          return (
                            <span key={rid} className="flex items-center">
                              <Badge tone={r ? 'teal' : 'red'} title={r?.statement ?? 'Not a requirement in the brief'}>
                                {rid}
                              </Badge>
                              {r && <Cite evidenceIds={r.citation.evidenceIds} quote={r.citation.quote} label={r.statement} />}
                            </span>
                          )
                        })}
                      </span>
                    </div>
                    <p className="mt-1 max-w-[80ch] text-[13px] leading-relaxed text-[var(--paper-300)]">
                      {f.description}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </section>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <section>
          <SectionHead title="Who uses it" count={bp.roles.length} />
          <ul className="flex flex-col gap-1.5">
            {bp.roles.map((r) => (
              <li key={r.id} className="panel px-4 py-2.5">
                <div className="flex items-baseline gap-2">
                  <span className="id text-[var(--teal-600)]">{r.id}</span>
                  <span className="text-[13.5px] font-medium text-[var(--paper-100)]">{r.name}</span>
                </div>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--paper-400)]">{r.responsibilities}</p>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <SectionHead title="Screens" count={bp.screens.length} />
          <ul className="flex flex-col gap-1.5">
            {bp.screens.map((s) => (
              <li key={s.id} className="panel px-4 py-2.5">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="id text-[var(--teal-600)]">{s.id}</span>
                  <span className="flex-1 text-[13.5px] font-medium text-[var(--paper-100)]">{s.name}</span>
                  {s.roleIds.map((rid) => (
                    <Badge key={rid} tone="violet" title={bp.roles.find((r) => r.id === rid)?.name}>
                      {bp.roles.find((r) => r.id === rid)?.name ?? rid}
                    </Badge>
                  ))}
                </div>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--paper-400)]">{s.purpose}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {bp.flow.length > 0 && (
        <section className="mb-8">
          <SectionHead title="How a user moves through it" count={bp.flow.length} />
          <ul className="flex flex-wrap gap-2">
            {bp.flow.map((f, i) => (
              <li key={i} className="panel flex items-center gap-2 px-3 py-2 text-[12.5px]">
                <span className="text-[var(--paper-100)]">{name(bp, f.fromScreenId)}</span>
                <span className="text-[var(--teal-400)]" aria-label="leads to">
                  →
                </span>
                <span className="text-[var(--paper-100)]">{name(bp, f.toScreenId)}</span>
                <span className="note ml-1">on {f.trigger}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <SectionHead title="Traceability" count={`${bp.features.length} × ${brief.requirements.length}`} />
        <p className="note mb-3">
          Read down for a requirement, across for a feature. An empty requirement column is scope the proposal does
          not yet deliver.
        </p>

        <div className="panel overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-b border-[var(--ink-600)] bg-[var(--ink-800)] px-3 py-2 text-left">
                  <span className="ap">requirement</span>
                </th>
                {bp.features.map((f) => (
                  <th
                    key={f.id}
                    className="border-b border-[var(--ink-600)] px-2 py-2 text-center align-bottom"
                    title={f.name}
                  >
                    <span className="id text-[10px]">{f.id}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {brief.requirements.map((r) => {
                const uncovered = matrix.uncovered.includes(r.id)
                return (
                  <tr key={r.id} className={uncovered ? 'bg-[color-mix(in_srgb,var(--flag-red)_8%,transparent)]' : undefined}>
                    <td className="sticky left-0 z-10 max-w-[380px] border-b border-[var(--ink-700)] bg-[var(--ink-800)] px-3 py-1.5">
                      <span className="id mr-2 text-[var(--teal-600)]">{r.id}</span>
                      <span className="text-[var(--paper-200)]">{r.statement}</span>
                      {uncovered && (
                        <Badge tone="red" className="ml-2">
                          uncovered
                        </Badge>
                      )}
                    </td>
                    {bp.features.map((f) => (
                      <td key={f.id} className="border-b border-[var(--ink-700)] px-2 py-1.5 text-center">
                        {matrix.covers(f.id, r.id) ? (
                          <span className="text-[var(--flag-green)]" title={`${f.name} delivers ${r.id}`}>
                            ●
                          </span>
                        ) : (
                          <span className="text-[var(--ink-500)]">·</span>
                        )}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {matrix.uncovered.length > 0 && (
          <p className="mt-3 text-[12.5px] text-[var(--flag-red)]">
            {matrix.uncovered.length} requirement{matrix.uncovered.length === 1 ? '' : 's'} ({matrix.uncovered.join(', ')}){' '}
            {matrix.uncovered.length === 1 ? 'is' : 'are'} not delivered by any proposed feature. Visible is better
            than invisible.
          </p>
        )}
      </section>
    </div>
  )
}

const name = (bp: Blueprint, id: string) => bp.screens.find((s) => s.id === id)?.name ?? id
