import { config } from '@/lib/config'
import { repo } from '@/lib/db/repo'
import { isRunning } from '@/lib/pipeline/run'
import { SOURCE_TYPE_LABEL } from '@/lib/types'
import { PipelineProgress } from '@/components/PipelineProgress'
import { AddSources } from '@/components/AddSources'
import { Badge, Label, SectionHead } from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function SourcesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sources = repo.listSources(id)
  const evidence = repo.getEvidence(id)

  const unitsBySource = new Map<string, number>()
  for (const u of evidence) unitsBySource.set(u.sourceId, (unitsBySource.get(u.sourceId) ?? 0) + 1)

  const byType = [...new Set(sources.map((s) => s.type))]

  return (
    <div className="mx-auto max-w-[980px] px-8 py-8">
      <header className="mb-6">
        <h1>Sources</h1>
        <p className="mt-1 max-w-[68ch] text-[13.5px] leading-relaxed text-[var(--paper-400)]">
          Everything the client has given us. Each source is split into addressable passages, and every claim the
          analysis makes later points back at one of them by id.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap gap-4">
        <Tile n={sources.length} label="sources" />
        <Tile n={byType.length} label="input types" />
        <Tile n={evidence.length} label="citable passages" />
        <Tile n={sources.filter((s) => s.status === 'FAILED').length} label="unreadable" tone="red" />
      </div>

      <div className="mb-6">
        <PipelineProgress
          engagementId={id}
          canRun={config.hasKey}
          hasSources={sources.length > 0}
          initiallyRunning={isRunning(id)}
        />
      </div>

      <SectionHead title="Material" count={sources.length} />

      {sources.length === 0 ? (
        <p className="panel px-4 py-10 text-center text-[13px] text-[var(--paper-400)]">
          Nothing added yet. Drop the client&rsquo;s files below.
        </p>
      ) : (
        <ul className="mb-8 flex flex-col gap-1.5">
          {sources.map((s) => {
            const units = unitsBySource.get(s.id) ?? 0
            return (
              <li
                key={s.id}
                className="panel flex flex-wrap items-center gap-x-4 gap-y-2 px-3.5 py-2.5"
              >
                <span className="min-w-[220px] flex-1">
                  <span className="block truncate text-[13.5px] text-[var(--paper-100)]" title={s.name}>
                    {s.name}
                  </span>
                  <span className="ap mt-0.5 block truncate">{describe(s.meta)}</span>
                </span>

                <Badge tone="teal">{SOURCE_TYPE_LABEL[s.type]}</Badge>

                <span className="tabular w-[110px] text-right font-[family-name:var(--mono)] text-[11.5px] text-[var(--paper-300)]">
                  {units > 0 ? `${units} passages` : '—'}
                </span>

                <span className="w-[74px] text-right">
                  {s.status === 'READY' && <Badge tone="green">read</Badge>}
                  {s.status === 'PENDING' && <Badge>pending</Badge>}
                  {s.status === 'FAILED' && (
                    <Badge tone="red" title={s.error}>
                      failed
                    </Badge>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {sources.some((s) => s.status === 'FAILED') && (
        <p className="mb-8 text-[12.5px] text-[var(--paper-400)]">
          A source that cannot be read is skipped and the run continues without it — one unreadable file should
          not cost the whole engagement. Hover the failed badge for the reason.
        </p>
      )}

      <AddSources engagementId={id} />
    </div>
  )
}

function Tile({ n, label, tone }: { n: number; label: string; tone?: 'red' }) {
  return (
    <div className="panel min-w-[122px] flex-1 px-3.5 py-2.5">
      <p
        className="tabular font-[family-name:var(--mono)] text-[22px] leading-tight"
        style={{ color: tone === 'red' && n > 0 ? 'var(--flag-red)' : 'var(--paper-100)' }}
      >
        {n}
      </p>
      <Label className="mt-0.5">{label}</Label>
    </div>
  )
}

/** One line of the most useful metadata each adapter recorded. */
function describe(meta: Record<string, string | number>): string {
  const parts: string[] = []
  if (meta.speakers) parts.push(String(meta.speakers))
  if (meta.participants) parts.push(String(meta.participants))
  if (meta.turns) parts.push(`${meta.turns} turns`)
  if (meta.messages) parts.push(`${meta.messages} messages`)
  if (meta.pages) parts.push(`${meta.pages} pages`)
  if (meta.durationSeconds) parts.push(`${Math.round(Number(meta.durationSeconds) / 60)} min, transcribed by ${meta.transcribedBy ?? 'whisper'}`)
  if (meta.screenName) parts.push(String(meta.screenName))
  if (meta.frictionSignals) parts.push(`${meta.frictionSignals} friction signals`)
  if (meta.url) parts.push(String(meta.url))
  return parts.join(' · ') || '—'
}
