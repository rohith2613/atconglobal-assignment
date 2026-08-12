import { NextResponse } from 'next/server'
import { repo } from '@/lib/db/repo'
import { Corpus } from '@/lib/evidence'
import { toMarkdown } from '@/lib/export/markdown'
import type { AppSpec } from '@/lib/schema/appspec'
import type { Blueprint } from '@/lib/schema/blueprint'
import type { Brief } from '@/lib/schema/brief'
import type { GapRow } from '@/lib/schema/gaps'
import type { Conflict } from '@/lib/schema/signals'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const format = new URL(req.url).searchParams.get('format') ?? 'md'

  const engagement = repo.getEngagement(id)
  if (!engagement) return NextResponse.json({ error: 'No such engagement.' }, { status: 404 })

  const slug = engagement.client.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  if (format === 'appspec') {
    const spec = repo.getArtifact<AppSpec>(id, 'appspec')
    if (!spec) return NextResponse.json({ error: 'No prototype has been generated yet.' }, { status: 404 })
    return new NextResponse(JSON.stringify(spec, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${slug}-appspec.json"`,
      },
    })
  }

  const brief = repo.getArtifact<Brief>(id, 'brief')
  if (!brief) return NextResponse.json({ error: 'No brief has been produced yet.' }, { status: 404 })

  const md = toMarkdown({
    client: engagement.client,
    engagement: engagement.name,
    brief,
    blueprint: repo.getArtifact<Blueprint>(id, 'blueprint'),
    conflicts: repo.getArtifact<{ conflicts: Conflict[] }>(id, 'reconciled')?.conflicts ?? [],
    gaps: repo.getArtifact<GapRow[]>(id, 'gaps') ?? [],
    corpus: new Corpus(repo.getEvidence(id)),
    overrides: repo.getClaimOverrides(id),
    generatedAt: repo.latestRun(id)?.finishedAt ?? new Date().toISOString(),
  })

  return new NextResponse(md, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}-discovery-brief.md"`,
    },
  })
}
