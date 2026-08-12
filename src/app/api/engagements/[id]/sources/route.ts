import { NextResponse } from 'next/server'
import { repo } from '@/lib/db/repo'
import { detectType } from '@/lib/ingest'
import type { SourceType } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_BYTES = 25 * 1024 * 1024

/**
 * Accepts uploaded files and website URLs. Sources are stored PENDING; nothing
 * is read until the pipeline runs, so an upload is always fast and a slow
 * transcription never blocks the browser.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!repo.getEngagement(id)) {
    return NextResponse.json({ error: 'No such engagement.' }, { status: 404 })
  }

  const form = await req.formData()
  const added: { id: string; name: string; type: SourceType }[] = []
  const rejected: { name: string; reason: string }[] = []

  for (const url of form.getAll('url')) {
    if (typeof url !== 'string' || !url.trim()) continue
    try {
      const parsed = new URL(url.trim())
      if (!/^https?:$/.test(parsed.protocol)) throw new Error('not http')
      const sid = repo.addSource(id, {
        type: 'website',
        name: parsed.hostname + parsed.pathname.replace(/\/$/, ''),
        status: 'PENDING',
        meta: { url: parsed.toString() },
      })
      added.push({ id: sid, name: parsed.hostname, type: 'website' })
    } catch {
      rejected.push({ name: String(url), reason: 'Not a valid http or https address.' })
    }
  }

  for (const entry of form.getAll('file')) {
    if (!(entry instanceof File)) continue

    if (entry.size > MAX_BYTES) {
      rejected.push({ name: entry.name, reason: `Larger than ${MAX_BYTES / 1024 / 1024} MB.` })
      continue
    }
    if (entry.size === 0) {
      rejected.push({ name: entry.name, reason: 'The file is empty.' })
      continue
    }

    const buffer = Buffer.from(await entry.arrayBuffer())
    const type = detectType(entry.name, buffer)
    const sid = repo.addSource(id, {
      type,
      name: entry.name,
      bytes: buffer.length,
      status: 'PENDING',
      // Held so the pipeline can read it back without a second upload.
      meta: { stagedBase64: buffer.toString('base64') },
    })
    added.push({ id: sid, name: entry.name, type })
  }

  return NextResponse.json({ added, rejected }, { status: added.length ? 201 : 400 })
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return NextResponse.json({ sources: repo.listSources(id) })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await params
  const sourceId = new URL(req.url).searchParams.get('sourceId')
  if (!sourceId) return NextResponse.json({ error: 'sourceId is required.' }, { status: 400 })
  repo.updateSource(sourceId, { status: 'FAILED', error: 'Removed by the consultant.' })
  return new NextResponse(null, { status: 204 })
}
