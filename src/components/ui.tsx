'use client'

import clsx from 'clsx'
import type { ReactNode } from 'react'

/**
 * UI primitives.
 *
 * Deliberately small. The interesting components in this project are the
 * evidence drawer and the POC renderer; everything here exists to keep those
 * two consistent and out of the way.
 */

// ---- structural apparatus --------------------------------------------------

/** A small uppercase mono label. The apparatus voice. */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('ap', className)}>{children}</div>
}

export function SectionHead({
  n,
  title,
  count,
  right,
}: {
  n?: string
  title: string
  count?: number | string
  right?: ReactNode
}) {
  return (
    <div className="mb-3 flex items-baseline gap-3 border-b border-[var(--ink-600)] pb-2">
      {n && <span className="ap text-[var(--teal-600)]">{n}</span>}
      <h2 className="flex-1">{title}</h2>
      {count !== undefined && <span className="ap tabular">{count}</span>}
      {right}
    </div>
  )
}

export function Panel({
  children,
  className,
  as: As = 'div',
}: {
  children: ReactNode
  className?: string
  as?: 'div' | 'section' | 'article' | 'li'
}) {
  return <As className={clsx('panel p-4', className)}>{children}</As>
}

// ---- badges ----------------------------------------------------------------

const TONES = {
  neutral: 'text-[var(--paper-300)] border-[var(--ink-500)] bg-[var(--ink-700)]',
  amber: 'text-[var(--amber-400)] border-[color-mix(in_srgb,var(--amber-400)_30%,transparent)] bg-[var(--amber-wash)]',
  teal: 'text-[var(--teal-300)] border-[var(--teal-600)] bg-[color-mix(in_srgb,var(--teal-600)_28%,transparent)]',
  red: 'text-[var(--flag-red)] border-[color-mix(in_srgb,var(--flag-red)_34%,transparent)] bg-[color-mix(in_srgb,var(--flag-red)_11%,transparent)]',
  green: 'text-[var(--flag-green)] border-[color-mix(in_srgb,var(--flag-green)_34%,transparent)] bg-[color-mix(in_srgb,var(--flag-green)_11%,transparent)]',
  violet: 'text-[var(--flag-violet)] border-[color-mix(in_srgb,var(--flag-violet)_34%,transparent)] bg-[color-mix(in_srgb,var(--flag-violet)_11%,transparent)]',
} as const

export type Tone = keyof typeof TONES

export function Badge({
  children,
  tone = 'neutral',
  title,
  className,
}: {
  children: ReactNode
  tone?: Tone
  title?: string
  className?: string
}) {
  return (
    <span
      title={title}
      className={clsx(
        'inline-flex shrink-0 items-center gap-1 rounded-[2px] border px-1.5 py-[1.5px]',
        'font-[family-name:var(--mono)] text-[10px] uppercase leading-[1.4] tracking-[0.07em]',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/**
 * Impact, severity and status all render with a GLYPH as well as a colour.
 * Colour alone fails anyone who cannot distinguish these hues and anyone
 * printing the page, and this is a document meant to be printed and argued over.
 */
export function Flag({ level, label }: { level: 'high' | 'medium' | 'low'; label?: string }) {
  const map = {
    high: { tone: 'red' as Tone, glyph: '▲', text: 'High' },
    medium: { tone: 'amber' as Tone, glyph: '◆', text: 'Medium' },
    low: { tone: 'neutral' as Tone, glyph: '▽', text: 'Low' },
  }[level]
  return (
    <Badge tone={map.tone}>
      <span aria-hidden>{map.glyph}</span>
      {label ?? map.text}
    </Badge>
  )
}

/** Confidence as filled/empty pips plus a word — never a bare colour. */
export function Confidence({ level }: { level: 'HIGH' | 'MEDIUM' | 'LOW' }) {
  const filled = level === 'HIGH' ? 3 : level === 'MEDIUM' ? 2 : 1
  const tone: Tone = level === 'HIGH' ? 'green' : level === 'MEDIUM' ? 'neutral' : 'neutral'
  return (
    <Badge
      tone={tone}
      title={
        level === 'HIGH'
          ? 'Corroborated by more than one independent source'
          : level === 'MEDIUM'
            ? 'Stated plainly, but by a single source'
            : 'A single hedged or passing remark'
      }
    >
      <span aria-hidden className="tracking-[-0.1em]">
        {'●'.repeat(filled)}
        {'○'.repeat(3 - filled)}
      </span>
      {level}
    </Badge>
  )
}

// ---- controls --------------------------------------------------------------

export function Button({
  children,
  onClick,
  variant = 'default',
  size = 'md',
  disabled,
  title,
  className,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'default' | 'primary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  disabled?: boolean
  title?: string
  className?: string
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-[var(--radius)] border font-medium',
        'transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45',
        size === 'sm' ? 'px-2 py-1 text-[12px]' : 'px-3 py-1.5 text-[13px]',
        variant === 'primary' &&
          'border-[var(--teal-600)] bg-[color-mix(in_srgb,var(--teal-400)_16%,transparent)] text-[var(--teal-300)] hover:bg-[color-mix(in_srgb,var(--teal-400)_26%,transparent)]',
        variant === 'default' &&
          'border-[var(--ink-500)] bg-[var(--ink-700)] text-[var(--paper-200)] hover:border-[var(--ink-400)] hover:bg-[var(--ink-650)]',
        variant === 'ghost' &&
          'border-transparent bg-transparent text-[var(--paper-400)] hover:bg-[var(--ink-750)] hover:text-[var(--paper-200)]',
        variant === 'danger' &&
          'border-[color-mix(in_srgb,var(--flag-red)_36%,transparent)] bg-transparent text-[var(--flag-red)] hover:bg-[color-mix(in_srgb,var(--flag-red)_12%,transparent)]',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="panel flex flex-col items-center gap-2 px-6 py-14 text-center">
      <p className="text-[15px] text-[var(--paper-200)]">{title}</p>
      {hint && <p className="max-w-md text-[13px] leading-relaxed text-[var(--paper-400)]">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Meter({ pct, tone = 'teal' }: { pct: number; tone?: 'teal' | 'amber' | 'green' | 'red' }) {
  const color =
    tone === 'amber' ? 'var(--amber-400)' : tone === 'green' ? 'var(--flag-green)' : tone === 'red' ? 'var(--flag-red)' : 'var(--teal-400)'
  return (
    <div
      className="h-1 w-full overflow-hidden rounded-[1px] bg-[var(--ink-600)]"
      role="img"
      aria-label={`${pct} percent`}
    >
      <div
        className="h-full transition-[width] duration-500 ease-out"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }}
      />
    </div>
  )
}

export function KeyValue({ k, v, mono }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="ap shrink-0">{k}</span>
      <span className={clsx('text-right text-[13px] text-[var(--paper-200)]', mono && 'tabular font-[family-name:var(--mono)]')}>
        {v}
      </span>
    </div>
  )
}

/** Copy-to-clipboard that reports what it did, in the interface's own voice. */
export function CopyButton({ text, label = 'Copy', size = 'sm' }: { text: string; label?: string; size?: 'sm' | 'md' }) {
  return (
    <Button
      size={size}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(
          () => announce('Copied'),
          () => announce('Could not copy — your browser blocked clipboard access'),
        )
      }}
    >
      {label}
    </Button>
  )
}

function announce(message: string): void {
  const el = document.createElement('div')
  el.setAttribute('role', 'status')
  el.textContent = message
  el.style.cssText =
    'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:100;' +
    'background:#191f28;border:1px solid #2c3542;color:#e8e4da;padding:7px 14px;' +
    'border-radius:3px;font-size:13px;box-shadow:0 6px 24px rgba(0,0,0,.5)'
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 1900)
}
