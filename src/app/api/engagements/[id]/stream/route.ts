import { encodeSse, subscribe, type RunEvent } from '@/lib/pipeline/run'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Live pipeline progress.
 *
 * Subscribing replays the backlog first: the client POSTs /run and only then
 * opens this stream, so without a replay the first stage events are always lost
 * and the UI opens on a pipeline that appears to have started halfway through.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false

      const send = (chunk: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          closed = true
        }
      }

      const unsubscribe = subscribe(id, (e: RunEvent) => {
        send(encodeSse(e))
        if (e.t === 'done' || e.t === 'error') {
          setTimeout(shutdown, 60)
        }
      })

      // Comment frames keep intermediaries from closing an idle connection.
      // Some pipeline stages run for over a minute without emitting anything.
      const keepAlive = setInterval(() => send(': keep-alive\n\n'), 15_000)

      function shutdown() {
        if (closed) return
        closed = true
        clearInterval(keepAlive)
        unsubscribe()
        try {
          controller.close()
        } catch {
          // Already closed by the client disconnecting.
        }
      }

      req.signal.addEventListener('abort', shutdown)
      send(': open\n\n')
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Without this, nginx and friends buffer the whole stream and deliver it
      // at the end, which looks exactly like the pipeline having hung.
      'X-Accel-Buffering': 'no',
    },
  })
}
