import { repo } from '@/lib/db/repo'
import type { Conflict } from '@/lib/schema/signals'
import { Quotation } from '@/components/Evidence'
import { Badge, CopyButton, Empty, Label, SectionHead } from '@/components/ui'

export const dynamic = 'force-dynamic'

const SEVERITY = {
  BLOCKING: { tone: 'red' as const, glyph: '■', text: 'Blocking — settle before quoting' },
  MATERIAL: { tone: 'amber' as const, glyph: '▲', text: 'Material — changes the estimate' },
  MINOR: { tone: 'neutral' as const, glyph: '·', text: 'Minor — worth confirming' },
}

export default async function ConflictsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const conflicts = repo.getArtifact<{ conflicts: Conflict[] }>(id, 'reconciled')?.conflicts ?? []

  const ordered = [...conflicts].sort((a, b) => weight(b.severity) - weight(a.severity))

  return (
    <div className="mx-auto max-w-[980px] px-8 py-8">
      <header className="mb-7">
        <div className="mb-1.5 flex flex-wrap items-baseline gap-3">
          <h1>Contradictions</h1>
          <span className="ap-lg">where the client&rsquo;s own sources disagree</span>
        </div>
        <p className="max-w-[70ch] text-[13.5px] leading-relaxed text-[var(--paper-400)]">
          None of these exists inside a single document. They only appear once the whole pack is read together,
          which is exactly why they survive a discovery phase and resurface later as a change request. Each side
          quotes the source verbatim; a contradiction whose quote could not be verified was discarded rather than
          shown.
        </p>
      </header>

      {ordered.length === 0 ? (
        <Empty
          title="No contradictions found"
          hint="Either the pack is genuinely consistent, or the analysis has not run yet. A contradiction is only reported when both sides can be quoted verbatim from different speakers."
        />
      ) : (
        <>
          <SectionHead
            title="Found"
            count={ordered.length}
            right={
              <CopyButton
                label="Copy all questions"
                text={ordered.map((c, i) => `${i + 1}. ${c.resolutionQuestion}`).join('\n\n')}
              />
            }
          />

          <ul className="flex flex-col gap-4">
            {ordered.map((c) => {
              const sev = SEVERITY[c.severity]
              return (
                <li key={c.id} className="panel overflow-hidden">
                  <div className="flex flex-wrap items-center gap-3 border-b border-[var(--ink-600)] px-4 py-2.5">
                    <Badge tone={sev.tone}>
                      <span aria-hidden>{sev.glyph}</span>
                      {c.severity}
                    </Badge>
                    <h2 className="min-w-0 flex-1 truncate text-[14.5px]">{c.subject}</h2>
                    <span className="ap hidden sm:block">{sev.text}</span>
                  </div>

                  <div className="grid gap-px bg-[var(--ink-600)] md:grid-cols-2">
                    <Side side={c.sideA} letter="A" />
                    <Side side={c.sideB} letter="B" />
                  </div>

                  <div className="border-t border-[var(--ink-600)] px-4 py-3">
                    <Label className="mb-1">Why it matters</Label>
                    <p className="mb-3 text-[13px] leading-relaxed text-[var(--paper-300)]">{c.whyItMatters}</p>

                    <div className="rounded-[var(--radius)] border border-[var(--teal-600)] bg-[color-mix(in_srgb,var(--teal-600)_14%,transparent)] p-3">
                      <div className="mb-1.5 flex items-center justify-between gap-3">
                        <Label className="text-[var(--teal-300)]">Ask the client</Label>
                        <CopyButton text={c.resolutionQuestion} label="Copy" />
                      </div>
                      <p className="prose-client text-[14.5px]">{c.resolutionQuestion}</p>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

function Side({ side, letter }: { side: Conflict['sideA']; letter: 'A' | 'B' }) {
  return (
    <div className="bg-[var(--ink-800)] px-4 py-3.5">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="ap text-[var(--amber-400)]">{letter}</span>
        <span className="ap flex-1 truncate">{side.sourceLabel}</span>
      </div>
      <p className="mb-2.5 text-[13.5px] leading-relaxed text-[var(--paper-100)]">{side.claim}</p>
      <Quotation cite={{ evidenceIds: side.evidenceIds, quote: side.quote, label: `Side ${letter}` }}>
        {side.quote}
      </Quotation>
    </div>
  )
}

const weight = (s: Conflict['severity']) => (s === 'BLOCKING' ? 3 : s === 'MATERIAL' ? 2 : 1)
