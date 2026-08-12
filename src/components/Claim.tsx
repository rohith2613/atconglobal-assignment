'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import clsx from 'clsx'
import type { ClaimOverride, ClaimStatus } from '@/lib/types'
import type { Citation } from '@/lib/schema/common'
import { Cite } from './Evidence'
import { Button } from './ui'

/**
 * One claim, set as a critical edition would set it: the assertion in the main
 * column in the client's own register, and the apparatus — citation, grading,
 * provenance — in the margin beside it.
 *
 * The margin is where a consultant's judgement is recorded too. An accepted or
 * rejected claim is marked HUMAN, and the mark survives a re-run, so the
 * document distinguishes what the machine asserted from what a person confirmed.
 */
export function Claim({
  id,
  engagementId,
  children,
  citation,
  label,
  marginalia,
  override,
  editable = true,
}: {
  id: string
  engagementId: string
  children: ReactNode
  citation?: Citation
  label?: string
  marginalia?: ReactNode
  override?: ClaimOverride
  editable?: boolean
}) {
  const router = useRouter()
  const [status, setStatus] = useState<ClaimStatus | undefined>(override?.status)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(override?.text ?? '')
  const [busy, setBusy] = useState(false)

  async function set(next: ClaimStatus | null, body?: string) {
    setBusy(true)
    try {
      await fetch(`/api/claims/${encodeURIComponent(id)}`, {
        method: next === null ? 'DELETE' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engagementId, status: next, text: body }),
      })
      setStatus(next ?? undefined)
      setEditing(false)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={clsx(
        'group grid grid-cols-1 gap-x-6 gap-y-1 border-l-2 py-2.5 pl-4 transition-colors md:grid-cols-[1fr_168px]',
        status === 'REJECTED'
          ? 'border-[color-mix(in_srgb,var(--flag-red)_50%,transparent)] opacity-55'
          : status === 'ACCEPTED'
            ? 'border-[color-mix(in_srgb,var(--flag-green)_50%,transparent)]'
            : status === 'EDITED'
              ? 'border-[var(--teal-400)]'
              : 'border-[var(--ink-600)] hover:border-[var(--ink-400)]',
      )}
    >
      <div className="min-w-0">
        {editing ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              className="w-full rounded-[var(--radius)] border border-[var(--ink-500)] bg-[var(--ink-900)] px-2.5 py-2 font-[family-name:var(--serif)] text-[15px] text-[var(--paper-100)]"
            />
            <div className="flex gap-2">
              <Button size="sm" variant="primary" onClick={() => set('EDITED', text)} disabled={busy || !text.trim()}>
                Save edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p
            className={clsx(
              'prose-client',
              status === 'REJECTED' && 'line-through decoration-[var(--flag-red)] decoration-1',
            )}
          >
            {status === 'EDITED' && override?.text ? override.text : children}
            {citation && <Cite evidenceIds={citation.evidenceIds} quote={citation.quote} label={label} />}
          </p>
        )}
      </div>

      {/* the apparatus */}
      <aside className="flex flex-row flex-wrap items-start gap-x-2 gap-y-1 md:flex-col md:items-end">
        <span className="id text-[10px] text-[var(--teal-600)]">{id}</span>
        {marginalia}

        {status && (
          <span
            className="ap"
            style={{
              color:
                status === 'REJECTED'
                  ? 'var(--flag-red)'
                  : status === 'ACCEPTED'
                    ? 'var(--flag-green)'
                    : 'var(--teal-400)',
            }}
          >
            {status.toLowerCase()} · human
          </span>
        )}

        {editable && (
          <span
            className={clsx(
              'flex gap-1 transition-opacity',
              status ? 'opacity-100' : 'opacity-0 focus-within:opacity-100 group-hover:opacity-100',
            )}
          >
            {status ? (
              <Button size="sm" variant="ghost" onClick={() => set(null)} disabled={busy} title="Remove your mark">
                undo
              </Button>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={() => set('ACCEPTED')} disabled={busy} title="Confirm this claim">
                  ✓
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setText(typeof children === 'string' ? children : '')
                    setEditing(true)
                  }}
                  title="Correct the wording"
                >
                  ✎
                </Button>
                <Button size="sm" variant="ghost" onClick={() => set('REJECTED')} disabled={busy} title="Reject this claim">
                  ✕
                </Button>
              </>
            )}
          </span>
        )}
      </aside>
    </div>
  )
}
