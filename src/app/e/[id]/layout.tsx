import { notFound } from 'next/navigation'
import { loadEngagement } from '@/lib/pipeline/run'
import { ensureDemoLoaded } from '@/lib/demo'
import { EvidenceProvider } from '@/components/Evidence'
import { Rail } from '@/components/Nav'

export const dynamic = 'force-dynamic'

/**
 * The shell loads the engagement once and hands it down. Evidence and source
 * text travel to the client because the evidence drawer needs to open
 * instantly — a citation that takes a round trip to resolve stops feeling like
 * turning to a footnote and starts feeling like a page load.
 */
export default async function EngagementLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  ensureDemoLoaded()

  const data = loadEngagement(id)
  if (!data.engagement) notFound()

  return (
    <EvidenceProvider evidence={data.evidence} sources={data.sources}>
      <div className="flex h-screen overflow-hidden">
        <Rail id={id} data={data} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </EvidenceProvider>
  )
}
