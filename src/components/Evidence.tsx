'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import type { EvidenceUnit, Source } from '@/lib/types'
import { SOURCE_TYPE_LABEL } from '@/lib/types'
import { Badge, Button, Label } from './ui'

/**
 * The interaction the whole architecture exists to enable: a claim in the brief
 * carries a footnote marker; clicking it turns to the source and shows the
 * exact span the claim was drawn from, in its original context.
 *
 * Everything upstream — addressable evidence units, verbatim quotes, the
 * validators that check both — is in service of this being trustworthy. If the
 * highlight ever landed on the wrong line the entire premise would be a lie, so
 * the offsets it uses are asserted in tests.
 */

type DrawerState = { evidenceIds: string[]; quote?: string; label?: string } | null

type Ctx = {
  open: (s: NonNullable<DrawerState>) => void
  close: () => void
  units: Map<string, EvidenceUnit>
  sources: Map<string, Source>
}

const EvidenceCtx = createContext<Ctx | null>(null)

export function EvidenceProvider({
  evidence,
  sources,
  children,
}: {
  evidence: EvidenceUnit[]
  sources: Source[]
  children: ReactNode
}) {
  const [state, setState] = useState<DrawerState>(null)

  const units = useMemo(() => new Map(evidence.map((u) => [u.id, u])), [evidence])
  const srcs = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources])

  const close = useCallback(() => setState(null), [])
  const ctx = useMemo<Ctx>(() => ({ open: setState, close, units, sources: srcs }), [close, units, srcs])

  return (
    <EvidenceCtx.Provider value={ctx}>
      {children}
      {state && <Drawer state={state} />}
    </EvidenceCtx.Provider>
  )
}

export const useEvidence = () => useContext(EvidenceCtx)

// ---------------------------------------------------------------------------

/**
 * A citation, set like a footnote marker in the client's prose.
 *
 * Shows the number of sources rather than the number of units, because two
 * quotes from one meeting is not corroboration and displaying "2" for it would
 * imply otherwise.
 */
export function Cite({
  evidenceIds,
  quote,
  label,
}: {
  evidenceIds: string[]
  quote?: string
  label?: string
}) {
  const ctx = useEvidence()
  if (!ctx || evidenceIds.length === 0) return null

  const known = evidenceIds.filter((id) => ctx.units.has(id))
  const units = known.map((id) => ctx.units.get(id)!)
  const sourceCount = new Set(units.map((u) => u.sourceId)).size

  if (known.length === 0) {
    return (
      <span
        className="cite"
        style={{ color: 'var(--flag-red)', borderColor: 'var(--flag-red)' }}
        title="This citation points at evidence that is not in the corpus."
      >
        ⚑ unresolved
      </span>
    )
  }

  // The source TYPE, not the evidence id. "E-src_de8c2cb9-039" is an internal
  // key and tells a reader nothing; "transcript" tells them where the claim
  // came from before they click, which is the question they actually have.
  const label2 =
    sourceCount > 1
      ? `${sourceCount} sources`
      : SOURCE_TYPE_LABEL[units[0].sourceType].toLowerCase().replace(' export', '').replace(' document', '').replace(' recording', '')

  const where = [...new Set(units.map((u) => ctx.sources.get(u.sourceId)?.name ?? u.sourceId))].join(', ')

  return (
    <button
      type="button"
      className="cite"
      onClick={() => ctx.open({ evidenceIds: known, quote, label })}
      title={`${where} — ${units[0].locator}${known.length > 1 ? ` and ${known.length - 1} more` : ''}`}
    >
      <span aria-hidden>❡</span>
      {label2}
    </button>
  )
}

// ---------------------------------------------------------------------------

function Drawer({ state }: { state: NonNullable<DrawerState> }) {
  const ctx = useContext(EvidenceCtx)!
  const [i, setI] = useState(0)

  const ids = state.evidenceIds
  const unit = ctx.units.get(ids[Math.min(i, ids.length - 1)])
  const source = unit ? ctx.sources.get(unit.sourceId) : undefined

  useEffect(() => setI(0), [state])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') ctx.close()
      if (e.key === 'ArrowRight' && ids.length > 1) setI((n) => Math.min(n + 1, ids.length - 1))
      if (e.key === 'ArrowLeft' && ids.length > 1) setI((n) => Math.max(n - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ctx, ids.length])

  if (!unit) return null

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[1px]"
        onClick={ctx.close}
        aria-hidden
        style={{ animation: 'fadeIn 160ms ease-out' }}
      />
      <aside
        role="dialog"
        aria-label="Source evidence"
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[620px] flex-col border-l border-[var(--ink-500)] bg-[var(--ink-850)] shadow-[-24px_0_60px_rgba(0,0,0,.45)]"
        style={{ animation: 'slideIn 220ms cubic-bezier(.22,.8,.3,1)' }}
      >
        <header className="border-b border-[var(--ink-600)] px-5 py-4">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Label>Turn to source</Label>
              <p className="mt-1 truncate text-[15px] font-medium text-[var(--paper-100)]">
                {source?.name ?? unit.sourceId}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={ctx.close} title="Close (Esc)">
              Close ✕
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="teal">{SOURCE_TYPE_LABEL[unit.sourceType]}</Badge>
            <span className="id text-[var(--amber-400)]">{unit.locator}</span>
            <span className="id">·</span>
            <span className="id">{unit.id}</span>
          </div>

          {state.label && (
            <p className="mt-3 border-l-2 border-[var(--ink-500)] pl-3 text-[12.5px] leading-snug text-[var(--paper-400)]">
              Supporting: {state.label}
            </p>
          )}

          {ids.length > 1 && (
            <div className="mt-3 flex items-center gap-2">
              <Button size="sm" onClick={() => setI((n) => Math.max(n - 1, 0))} disabled={i === 0}>
                ← Previous
              </Button>
              <span className="ap tabular">
                passage {i + 1} of {ids.length}
              </span>
              <Button size="sm" onClick={() => setI((n) => Math.min(n + 1, ids.length - 1))} disabled={i === ids.length - 1}>
                Next →
              </Button>
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <SourceText source={source} unit={unit} />
        </div>

        <footer className="border-t border-[var(--ink-600)] px-5 py-2.5">
          <p className="ap">
            {ids.length > 1 ? '← → to move between passages · ' : ''}Esc to close
          </p>
        </footer>
      </aside>

      <style>{`
        @keyframes slideIn { from { transform: translateX(28px); opacity: 0 } }
        @keyframes fadeIn { from { opacity: 0 } }
      `}</style>
    </>
  )
}

/**
 * The source document with the cited span marked in place.
 *
 * The span is located by char offset rather than by searching for the text: a
 * transcript where three people say "Yes." would otherwise highlight the first
 * one every time, and the highlight would be quietly, confidently wrong.
 */
function SourceText({ source, unit }: { source?: Source; unit: EvidenceUnit }) {
  const full = source?.rawText ?? ''

  useEffect(() => {
    // Two frames, and instantly rather than smoothly. The drawer slides in on a
    // transform, and a smooth scroll started during that animation is dropped —
    // which left the reader at the top of a 400-line transcript with the passage
    // they asked for somewhere below the fold. Landing on it directly is also
    // the better behaviour: this is "turn to the footnote", not a tour.
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document.getElementById('evidence-hit')?.scrollIntoView({ block: 'center', behavior: 'auto' }),
      ),
    )
    return () => cancelAnimationFrame(id)
  }, [unit.id])

  if (!full) {
    return (
      <div className="prose-client">
        <mark className="evidence-hit" id="evidence-hit">
          {unit.text}
        </mark>
      </div>
    )
  }

  const start = Math.max(0, Math.min(unit.charStart, full.length))
  const end = Math.max(start, Math.min(unit.charEnd, full.length))

  return (
    <div className="prose-client whitespace-pre-wrap break-words text-[14.5px] leading-[1.7]">
      <Dim>{full.slice(0, start)}</Dim>
      <mark className="evidence-hit" id="evidence-hit">
        {full.slice(start, end)}
      </mark>
      <Dim>{full.slice(end)}</Dim>
    </div>
  )
}

/**
 * Surrounding context. Recessive enough that the cited span is obviously the
 * subject, but still readable — a reader checking a citation usually wants the
 * sentence before and after it, and unreadable context defeats the purpose.
 */
const Dim = ({ children }: { children: string }) => (
  <span className="text-[var(--paper-400)]">{children}</span>
)

/** Inline quotation of the client's own words, in the serif voice. */
export function Quotation({
  children,
  cite,
  className,
}: {
  children: ReactNode
  cite?: { evidenceIds: string[]; quote?: string; label?: string }
  className?: string
}) {
  return (
    <blockquote
      className={clsx(
        'quote border-l-2 border-[color-mix(in_srgb,var(--amber-400)_45%,transparent)] pl-3',
        className,
      )}
    >
      “{children}”
      {cite && <Cite {...cite} />}
    </blockquote>
  )
}
