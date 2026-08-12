import { NextResponse } from 'next/server'
import { repo } from '@/lib/db/repo'
import type { ClaimStatus } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const VALID: ClaimStatus[] = ['ACCEPTED', 'REJECTED', 'EDITED']

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = (await req.json()) as { engagementId?: string; status?: ClaimStatus; text?: string }

  if (!body.engagementId || !repo.getEngagement(body.engagementId)) {
    return NextResponse.json({ error: 'No such engagement.' }, { status: 404 })
  }
  if (!body.status || !VALID.includes(body.status)) {
    return NextResponse.json({ error: `status must be one of ${VALID.join(', ')}.` }, { status: 400 })
  }
  if (body.status === 'EDITED' && !body.text?.trim()) {
    return NextResponse.json({ error: 'An edited claim needs replacement text.' }, { status: 400 })
  }

  repo.setClaimStatus(body.engagementId, decodeURIComponent(id), body.status, body.text?.trim())
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { engagementId?: string }
  if (!body.engagementId) {
    return NextResponse.json({ error: 'engagementId is required.' }, { status: 400 })
  }
  repo.clearClaimStatus(body.engagementId, decodeURIComponent(id))
  return NextResponse.json({ ok: true })
}
