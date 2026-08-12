'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import clsx from 'clsx'
import { STAGES, STAGE_LABEL, type RunEvent, type Stage } from '@/lib/pipeline/events'
import { Badge, Button, Label } from './ui'

type StageState = {
  status: 'waiting' | 'running' | 'done' | 'failed'
  detail?: string
  progress?: { done: number; total: number; label: string }
  attempts: number
  notes: string[]
}

function blank(): Record<Stage, StageState> {
  const out = {} as Record<Stage, StageState>
  for (const s of STAGES) out[s] = { status: 'waiting', attempts: 1, notes: [] }
  return out
}

/**
 * Live pipeline progress over SSE.
 *
 * The run takes minutes, so the question this answers is not "is it done" but
 * "is it still working, and on what". Retries are shown rather than hidden:
 * a stage that had to be regenerated because a citation did not check out is
 * the system working, and it is the most interesting thing on the screen.
 */
export function PipelineProgress({
  engagementId,
  canRun,
  hasSources,
  initiallyRunning,
}: {
  engagementId: string
  canRun: boolean
  hasSources: boolean
  initiallyRunning: boolean
}) {
  const router = useRouter()
  const [running, setRunning] = useState(initiallyRunning)
  const [stages, setStages] = useState<Record<Stage, StageState>>(blank)
  const [cost, setCost] = useState({ calls: 0, usd: 0, inTok: 0, outTok: 0 })
  const [error, setError] = useState<string | null>(null)
  const [finished, setFinished] = useState<string[] | null>(null)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!running) return

    const es = new EventSource(`/api/engagements/${engagementId}/stream`)
    esRef.current = es

    es.onmessage = (msg) => {
      const e = JSON.parse(msg.data) as RunEvent

      setStages((prev) => {
        const next = { ...prev }
        const patch = (s: Stage, p: Partial<StageState>) => {
          next[s] = { ...next[s], ...p }
        }

        if (e.t === 'stage') {
          if (e.status === 'START') patch(e.stage, { status: 'running' })
          if (e.status === 'DONE') patch(e.stage, { status: 'done', progress: undefined })
          if (e.status === 'FAIL') patch(e.stage, { status: 'failed', detail: e.detail })
        }
        if (e.t === 'progress') patch(e.stage, { progress: { done: e.done, total: e.total, label: e.label } })
        if (e.t === 'attempt') {
          patch(e.stage, {
            attempts: e.attempt + 1,
            notes: [...next[e.stage].notes, `attempt ${e.attempt} rejected — ${e.because ?? 'verification failed'}`],
          })
        }
        if (e.t === 'note') patch(e.stage, { notes: [...next[e.stage].notes, e.text] })
        return next
      })

      if (e.t === 'trace') {
        setCost((c) => ({
          calls: c.calls + 1,
          usd: c.usd + e.entry.costUsd,
          inTok: c.inTok + e.entry.promptTokens,
          outTok: c.outTok + e.entry.completionTokens,
        }))
      }
      if (e.t === 'error') {
        setError(e.message)
        setRunning(false)
        es.close()
      }
      if (e.t === 'done') {
        setFinished(e.needsHumanReview)
        setRunning(false)
        es.close()
        router.refresh()
      }
    }

    es.onerror = () => {
      // The stream closes normally when a run finishes; only report a failure
      // if we were not expecting it.
      if (es.readyState === EventSource.CLOSED && running) {
        setRunning(false)
        router.refresh()
      }
    }

    return () => es.close()
  }, [running, engagementId, router])

  async function start() {
    setError(null)
    setFinished(null)
    setStages(blank())
    setCost({ calls: 0, usd: 0, inTok: 0, outTok: 0 })

    const res = await fetch(`/api/engagements/${engagementId}/run`, { method: 'POST' })
    if (!res.ok) {
      const body = (await res.json()) as { error?: string }
      setError(body.error ?? 'The run could not be started.')
      return
    }
    setRunning(true)
  }

  const anyActivity = running || finished || error || Object.values(stages).some((s) => s.status !== 'waiting')

  return (
    <section className="panel p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Label>Pipeline</Label>
          <p className="mt-0.5 text-[13px] text-[var(--paper-300)]">
            {running
              ? 'Reading the sources and building the brief. This takes a few minutes.'
              : hasSources
                ? 'Eight stages, each verified before the next begins.'
                : 'Add at least one source to run.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {cost.calls > 0 && (
            <span className="ap tabular">
              {cost.calls} calls · {(cost.inTok / 1000).toFixed(1)}k in · {(cost.outTok / 1000).toFixed(1)}k out ·
              ${cost.usd.toFixed(4)}
            </span>
          )}
          <Button variant="primary" onClick={start} disabled={running || !hasSources || !canRun}>
            {running ? 'Running…' : anyActivity ? 'Run again' : 'Run analysis'}
          </Button>
        </div>
      </div>

      {!canRun && (
        <p className="mb-3 text-[12.5px] text-[var(--paper-400)]">
          No API key configured, so this engagement cannot be re-run. You are looking at a saved run.
        </p>
      )}

      {error && (
        <p className="mb-3 rounded-[var(--radius)] border border-[color-mix(in_srgb,var(--flag-red)_34%,transparent)] bg-[color-mix(in_srgb,var(--flag-red)_10%,transparent)] px-3 py-2 text-[12.5px] text-[var(--flag-red)]" role="alert">
          {error}
        </p>
      )}

      {finished && (
        <p className="mb-3 text-[12.5px] text-[var(--flag-green)]" role="status">
          Analysis complete.
          {finished.length > 0 && (
            <span className="text-[var(--flag-amber)]">
              {' '}
              {finished.join(' and ')} exhausted {finished.length === 1 ? 'its' : 'their'} retries and{' '}
              {finished.length === 1 ? 'is' : 'are'} flagged for review.
            </span>
          )}
        </p>
      )}

      {anyActivity && (
        <ol className="flex flex-col">
          {STAGES.map((s, i) => {
            const st = stages[s]
            return (
              <li
                key={s}
                className={clsx(
                  'flex items-start gap-3 border-l-2 py-1.5 pl-3',
                  st.status === 'running' && 'border-[var(--teal-400)]',
                  st.status === 'done' && 'border-[var(--flag-green)]',
                  st.status === 'failed' && 'border-[var(--flag-red)]',
                  st.status === 'waiting' && 'border-[var(--ink-600)]',
                )}
              >
                <span className="ap w-[18px] shrink-0 pt-[3px]">{String(i + 1).padStart(2, '0')}</span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span
                      className={clsx(
                        'text-[13px]',
                        st.status === 'waiting' ? 'text-[var(--paper-500)]' : 'text-[var(--paper-100)]',
                      )}
                    >
                      {STAGE_LABEL[s]}
                    </span>
                    {st.status === 'running' && <span className="ap text-[var(--teal-400)]">working</span>}
                    {st.attempts > 1 && (
                      <Badge tone="amber" title="The loop rejected an earlier attempt and regenerated it">
                        attempt {st.attempts}
                      </Badge>
                    )}
                  </span>

                  {st.progress && (
                    <span className="ap mt-0.5 block truncate">
                      {st.progress.done}/{st.progress.total} · {st.progress.label}
                    </span>
                  )}

                  {st.notes.slice(-2).map((n, k) => (
                    <span key={k} className="ap mt-0.5 block truncate text-[var(--paper-500)]">
                      {n}
                    </span>
                  ))}

                  {st.detail && (
                    <span className="mt-1 block text-[12px] leading-snug text-[var(--flag-red)]">{st.detail}</span>
                  )}
                </span>

                <span
                  aria-hidden
                  className="ap w-4 shrink-0 pt-[3px] text-right"
                  style={{
                    color:
                      st.status === 'done'
                        ? 'var(--flag-green)'
                        : st.status === 'failed'
                          ? 'var(--flag-red)'
                          : undefined,
                  }}
                >
                  {st.status === 'done' ? '✓' : st.status === 'failed' ? '✕' : st.status === 'running' ? '·' : ''}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
