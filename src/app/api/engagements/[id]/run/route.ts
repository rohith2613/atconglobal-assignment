import { NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { repo } from '@/lib/db/repo'
import { isRunning, runPipeline } from '@/lib/pipeline/run'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 800

/**
 * Starts the pipeline and returns immediately.
 *
 * The run takes minutes; holding the request open for it would hit every proxy
 * timeout between here and the browser. Progress goes out over the SSE stream
 * instead, and the response only reports that the run was accepted.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (!repo.getEngagement(id)) {
    return NextResponse.json({ error: 'No such engagement.' }, { status: 404 })
  }
  if (!config.hasKey) {
    return NextResponse.json(
      {
        error:
          'No API key configured. Add OPENAI_API_KEY to .env to run the pipeline, or explore the committed demo run, which needs no key.',
      },
      { status: 400 },
    )
  }
  if (isRunning(id)) {
    return NextResponse.json({ error: 'This engagement is already running.' }, { status: 409 })
  }
  if (repo.listSources(id).length === 0) {
    return NextResponse.json({ error: 'Add at least one source before running.' }, { status: 400 })
  }

  // Deliberately not awaited. The error is caught inside runPipeline, recorded
  // on the run and emitted to the stream; an unhandled rejection here would
  // take the whole server process down.
  void runPipeline({ engagementId: id }).catch(() => {})

  return NextResponse.json({ started: true }, { status: 202 })
}
