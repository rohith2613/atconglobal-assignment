import { repo } from '@/lib/db/repo'
import type { AppSpec } from '@/lib/schema/appspec'
import type { Blueprint } from '@/lib/schema/blueprint'
import type { Violation } from '@/lib/verify/types'
import { PocFrame } from '@/components/poc/PocFrame'
import { Badge, Empty, Label, SectionHead } from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function PocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const spec = repo.getArtifact<AppSpec>(id, 'appspec')
  const bp = repo.getArtifact<Blueprint>(id, 'blueprint')
  const review = repo.getArtifact<{ needsHumanReview: string[]; violations: Violation[] }>(id, 'review')

  if (!spec) {
    return (
      <div className="mx-auto max-w-[1180px] px-8 py-8">
        <Empty
          title="No prototype yet"
          hint="Run the analysis. The prototype is generated as a validated specification and drawn by a renderer, so nothing generated is ever executed — and it always renders."
        />
      </div>
    )
  }

  const blocks = spec.screens.flatMap((s) => s.blocks.map((b) => b.kind))
  const kinds = [...new Set(blocks)]

  return (
    <div className="mx-auto max-w-[1180px] px-8 py-8">
      <header className="mb-6">
        <div className="mb-1.5 flex flex-wrap items-baseline gap-3">
          <h1>Prototype</h1>
          <span className="ap-lg">what the proposal looks like</span>
        </div>
        <p className="max-w-[74ch] text-[13.5px] leading-relaxed text-[var(--paper-400)]">
          Clickable, and seeded with the client&rsquo;s own customers, lanes and references rather than placeholder
          data. Switch role to see what each person would get. The model produced a validated specification, not
          code — this page renders it with ordinary reviewed components, so nothing generated is executed.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Badge tone="teal">{spec.screens.length} screens</Badge>
        <Badge tone="violet">{spec.roles.length} roles</Badge>
        <Badge>{kinds.length} of 8 block types</Badge>
        {review?.needsHumanReview.includes('poc') && (
          <Badge tone="amber">⚑ flagged — the loop could not fully clear it</Badge>
        )}
      </div>

      <PocFrame spec={spec} blueprintRoles={bp?.roles.map((r) => r.name) ?? []} />

      <section className="mt-8">
        <SectionHead title="Where each screen came from" count={spec.screens.length} />
        <ul className="flex flex-col gap-1.5">
          {spec.screens.map((s) => {
            const fromBlueprint = bp?.screens.find(
              (x) => x.id === s.id || x.name.toLowerCase() === s.name.toLowerCase(),
            )
            return (
              <li key={s.id} className="panel flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5">
                <span className="id w-[30px] shrink-0 text-[var(--teal-600)]">{s.id}</span>
                <span className="min-w-[150px] flex-1 text-[13.5px] text-[var(--paper-100)]">{s.name}</span>
                <span className="ap flex-1 truncate">
                  {fromBlueprint?.purpose ?? 'introduced by the prototype'}
                </span>
                <span className="flex gap-1">
                  {s.blocks.map((b, i) => (
                    <Badge key={i}>{b.kind}</Badge>
                  ))}
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="mt-8">
        <Label className="mb-2">The specification behind it</Label>
        <details className="panel">
          <summary className="cursor-pointer px-4 py-2.5 text-[13px] text-[var(--paper-300)] hover:text-[var(--paper-100)]">
            Show the validated AppSpec JSON
          </summary>
          <pre className="max-h-[460px] overflow-auto border-t border-[var(--ink-600)] bg-[var(--ink-900)] p-4 font-[family-name:var(--mono)] text-[11px] leading-relaxed text-[var(--paper-300)]">
            {JSON.stringify(spec, null, 2)}
          </pre>
        </details>
      </section>
    </div>
  )
}
