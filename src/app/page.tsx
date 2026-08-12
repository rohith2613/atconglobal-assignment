import Link from 'next/link'
import { repo } from '@/lib/db/repo'
import { config } from '@/lib/config'
import { ensureDemoLoaded, demoGeneratedAt } from '@/lib/demo'
import { NewEngagement } from '@/components/NewEngagement'

export const dynamic = 'force-dynamic'

export default function Home() {
  ensureDemoLoaded()

  const engagements = repo.listEngagements().map((e) => {
    const sources = repo.listSources(e.id)
    return {
      ...e,
      sources: sources.length,
      ready: sources.filter((s) => s.status === 'READY').length,
      brief: Boolean(repo.getArtifact(e.id, 'brief')),
      conflicts: (repo.getArtifact<{ conflicts: unknown[] }>(e.id, 'reconciled')?.conflicts ?? []).length,
      run: repo.latestRun(e.id),
    }
  })

  const demoAt = demoGeneratedAt()

  return (
    <div className="mx-auto max-w-[860px] px-8 py-14">
      <header className="mb-10">
        <div className="mb-3 flex items-baseline gap-3">
          <h1 className="text-[26px]">Prism</h1>
          <span className="ap-lg">business discovery → poc</span>
        </div>
        <p className="prose-client max-w-[62ch] text-[15px] text-[var(--paper-300)]">
          Client requirements arrive as transcripts, chat exports, PDFs, screenshots and recordings. Prism reads
          all of it, works out what the client actually needs, shows where their own sources disagree, names what
          nobody has asked yet, and builds a prototype of the answer — with every claim traceable to the words it
          came from.
        </p>
      </header>

      {!config.hasKey && (
        <div className="panel mb-8 border-[color-mix(in_srgb,var(--amber-400)_28%,transparent)] bg-[color-mix(in_srgb,var(--amber-wash)_45%,transparent)] p-4">
          <p className="ap mb-1 text-[var(--amber-400)]">Demo mode</p>
          <p className="text-[13px] leading-relaxed text-[var(--paper-200)]">
            No API key is configured, so you are seeing a real pipeline run over the sample corpus that was saved
            {demoAt ? ` on ${new Date(demoAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}.
            Every screen is populated and every citation resolves. Add <code className="id">OPENAI_API_KEY</code> to{' '}
            <code className="id">.env</code> to run the pipeline on your own material.
          </p>
        </div>
      )}

      <section className="mb-8">
        <div className="mb-3 flex items-baseline justify-between border-b border-[var(--ink-600)] pb-2">
          <h2>Engagements</h2>
          <span className="ap tabular">{engagements.length}</span>
        </div>

        {engagements.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-[var(--paper-400)]">
            No engagements yet. Create one below and add the client&rsquo;s material.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {engagements.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/e/${e.id}/${e.brief ? 'brief' : 'sources'}`}
                  className="panel flex items-center gap-4 px-4 py-3.5 transition-colors hover:border-[var(--ink-400)] hover:bg-[var(--ink-750)]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium text-[var(--paper-100)]">{e.client}</p>
                    <p className="ap mt-0.5 truncate">{e.name}</p>
                  </div>

                  <div className="flex shrink-0 items-center gap-5 text-right">
                    <Stat n={e.sources} label="sources" />
                    <Stat n={e.conflicts} label="conflicts" tone={e.conflicts > 0 ? 'red' : undefined} />
                    <span
                      className="ap w-[74px] text-right"
                      style={{
                        color: e.brief
                          ? 'var(--flag-green)'
                          : e.run?.status === 'RUNNING'
                            ? 'var(--teal-400)'
                            : e.run?.status === 'FAILED'
                              ? 'var(--flag-red)'
                              : undefined,
                      }}
                    >
                      {e.brief ? 'analysed' : (e.run?.status?.toLowerCase() ?? 'not run')}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <NewEngagement />

      <footer className="mt-14 border-t border-[var(--ink-600)] pt-4">
        <p className="ap">
          Nordwind Logistics is a fictional client, authored for this project. Its sources contain deliberate
          contradictions and deliberate omissions.
        </p>
      </footer>
    </div>
  )
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: 'red' }) {
  return (
    <span className="flex flex-col items-end">
      <span
        className="tabular font-[family-name:var(--mono)] text-[15px]"
        style={{ color: tone === 'red' && n > 0 ? 'var(--flag-red)' : 'var(--paper-200)' }}
      >
        {n}
      </span>
      <span className="ap text-[9px]">{label}</span>
    </span>
  )
}
