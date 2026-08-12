import { NextResponse } from 'next/server'
import { repo } from '@/lib/db/repo'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const engagements = repo.listEngagements().map((e) => ({
    ...e,
    sourceCount: repo.listSources(e.id).length,
    hasBrief: Boolean(repo.getArtifact(e.id, 'brief')),
    run: repo.latestRun(e.id),
  }))
  return NextResponse.json({ engagements })
}

export async function POST(req: Request) {
  const body = (await req.json()) as { name?: string; client?: string }
  const name = body.name?.trim()
  const client = body.client?.trim()

  if (!name || !client) {
    return NextResponse.json({ error: 'An engagement needs a name and a client.' }, { status: 400 })
  }

  return NextResponse.json({ id: repo.createEngagement(name, client) }, { status: 201 })
}
