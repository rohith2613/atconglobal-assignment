import { NextResponse } from 'next/server'
import { repo } from '@/lib/db/repo'
import { loadEngagement } from '@/lib/pipeline/run'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!repo.getEngagement(id)) {
    return NextResponse.json({ error: 'No such engagement.' }, { status: 404 })
  }
  return NextResponse.json(loadEngagement(id))
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  repo.deleteEngagement(id)
  return new NextResponse(null, { status: 204 })
}
