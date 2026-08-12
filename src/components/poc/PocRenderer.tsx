'use client'

import { useMemo, useState } from 'react'
import clsx from 'clsx'
import type { AppSpec, Block, ScreenIcon } from '@/lib/schema/appspec'

/**
 * Draws a validated AppSpec.
 *
 * Nothing generated is executed. The model produced data; this file is ordinary
 * reviewed React that switches on a fixed set of block kinds. That is the whole
 * reason the POC stage emits a spec instead of code: a spec cannot fail to
 * parse, cannot do anything unexpected, and can be diffed like a document.
 *
 * The prototype is styled as a light, conventional business application rather
 * than in Prism's own palette — a client looking at their proposed system
 * should be looking at their system, not at the tool that made it.
 */

const ICON: Record<ScreenIcon, string> = {
  inbox: '▤',
  file: '▢',
  table: '▦',
  board: '▥',
  chart: '▮',
  clock: '◴',
  user: '◍',
  settings: '⚙',
  search: '⌕',
  check: '✓',
}

export function PocRenderer({ spec }: { spec: AppSpec }) {
  const [roleId, setRoleId] = useState(spec.roles[0]?.id ?? '')

  const visible = useMemo(
    () => spec.screens.filter((s) => s.roleIds.includes(roleId)),
    [spec.screens, roleId],
  )

  const [screenId, setScreenId] = useState(visible[0]?.id ?? spec.screens[0]?.id ?? '')

  // A role switch can hide the open screen. Falling back keeps the prototype on
  // something rather than rendering an empty frame.
  const screen = visible.find((s) => s.id === screenId) ?? visible[0] ?? spec.screens[0]

  const go = (target: string | null) => {
    if (!target) return
    const next = spec.screens.find((s) => s.id === target)
    if (!next) return
    if (!next.roleIds.includes(roleId)) setRoleId(next.roleIds[0])
    setScreenId(target)
  }

  return (
    <div className="poc overflow-hidden rounded-[4px] border border-[var(--ink-500)] bg-white text-[#1f2430]">
      <header className="flex flex-wrap items-center gap-3 border-b border-[#dfe3ea] bg-[#f7f8fa] px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-[#141821]">{spec.appName}</p>
          <p className="truncate text-[11.5px] text-[#6b7280]">{spec.tagline}</p>
        </div>

        <label className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-[0.07em] text-[#6b7280]">Signed in as</span>
          <select
            value={roleId}
            onChange={(e) => {
              setRoleId(e.target.value)
              const first = spec.screens.find((s) => s.roleIds.includes(e.target.value))
              if (first) setScreenId(first.id)
            }}
            className="rounded-[3px] border border-[#cbd2dc] bg-white px-2 py-1 text-[12.5px] text-[#1f2430]"
          >
            {spec.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      <nav className="flex flex-wrap gap-0.5 border-b border-[#dfe3ea] bg-white px-3 pt-2">
        {visible.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setScreenId(s.id)}
            aria-current={s.id === screen?.id ? 'page' : undefined}
            className={clsx(
              'flex items-center gap-1.5 rounded-t-[3px] border border-b-0 px-3 py-1.5 text-[12.5px] transition-colors',
              s.id === screen?.id
                ? 'border-[#dfe3ea] bg-[#eef4fb] font-medium text-[#12467f]'
                : 'border-transparent text-[#4b5563] hover:bg-[#f4f6f9]',
            )}
          >
            <span aria-hidden className="text-[13px] opacity-70">
              {ICON[s.icon]}
            </span>
            {s.name}
          </button>
        ))}
        {visible.length === 0 && (
          <p className="px-2 py-2 text-[12.5px] text-[#6b7280]">
            This role has no screens in the proposal.
          </p>
        )}
      </nav>

      <div className="flex flex-col gap-4 bg-[#fafbfc] p-4">
        {screen?.blocks.map((b, i) => (
          <BlockView key={i} block={b} onGo={go} />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function BlockView({ block, onGo }: { block: Block; onGo: (t: string | null) => void }) {
  switch (block.kind) {
    case 'statRow':
      return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {block.stats.map((s, i) => (
            <div key={i} className="rounded-[3px] border border-[#e3e7ee] bg-white px-3.5 py-3">
              <p className="text-[11px] uppercase tracking-[0.06em] text-[#6b7280]">{s.label}</p>
              <p className="mt-1 text-[22px] font-semibold leading-tight text-[#141821]">{s.value}</p>
              {s.delta && <p className="mt-0.5 text-[11.5px] text-[#2f7d5a]">{s.delta}</p>}
            </div>
          ))}
        </div>
      )

    case 'table':
      return (
        <Card title={block.title}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr>
                  {block.columns.map((c) => (
                    <th
                      key={c}
                      className="border-b border-[#e3e7ee] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#6b7280]"
                    >
                      {c}
                    </th>
                  ))}
                  {block.rowActionLabel && <th className="border-b border-[#e3e7ee] px-3 py-2" />}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, i) => (
                  <tr key={i} className="hover:bg-[#f7f9fc]">
                    {row.map((cell, j) => (
                      <td key={j} className="border-b border-[#eef1f5] px-3 py-2 align-middle">
                        {j === block.statusColumn ? <Pill>{cell}</Pill> : cell}
                      </td>
                    ))}
                    {block.rowActionLabel && (
                      <td className="border-b border-[#eef1f5] px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => onGo(block.rowActionTarget)}
                          className="rounded-[3px] border border-[#c3d3e8] bg-[#eef4fb] px-2.5 py-1 text-[11.5px] font-medium text-[#12467f] hover:bg-[#e0ebf8]"
                        >
                          {block.rowActionLabel}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )

    case 'form':
      return (
        <Card title={block.title}>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault()
              onGo(block.submitTarget)
            }}
          >
            {block.fields.map((f, i) => {
              const fid = `poc-f-${i}-${f.label.replace(/\W+/g, '')}`
              return (
                <div key={i} className={clsx(f.type === 'textarea' && 'sm:col-span-2')}>
                  <label htmlFor={fid} className="mb-1 block text-[11.5px] font-medium text-[#4b5563]">
                    {f.label}
                    {f.required && <span className="ml-1 text-[#b4472f]">*</span>}
                  </label>
                  {f.type === 'select' ? (
                    <select id={fid} className={INPUT} defaultValue="">
                      <option value="" disabled>
                        {f.placeholder || 'Choose…'}
                      </option>
                      {f.options.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  ) : f.type === 'textarea' ? (
                    <textarea id={fid} rows={3} placeholder={f.placeholder} className={INPUT} />
                  ) : f.type === 'checkbox' ? (
                    <input id={fid} type="checkbox" className="mt-1 h-4 w-4 accent-[#12467f]" />
                  ) : (
                    <input id={fid} type={f.type} placeholder={f.placeholder} className={INPUT} />
                  )}
                </div>
              )
            })}
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="rounded-[3px] bg-[#12467f] px-4 py-1.5 text-[12.5px] font-medium text-white hover:bg-[#0e3763]"
              >
                {block.submitLabel}
              </button>
            </div>
          </form>
        </Card>
      )

    case 'kanban':
      return (
        <Card title={block.title}>
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${block.columns.length}, minmax(160px, 1fr))` }}>
            {block.columns.map((col) => (
              <div key={col.name} className="rounded-[3px] bg-[#f2f4f8] p-2">
                <p className="mb-2 flex items-baseline justify-between px-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#6b7280]">
                  {col.name}
                  <span className="text-[#9aa3af]">{col.cards.length}</span>
                </p>
                <div className="flex flex-col gap-2">
                  {col.cards.map((c, i) => (
                    <div key={i} className="rounded-[3px] border border-[#e3e7ee] bg-white px-2.5 py-2">
                      <p className="text-[12.5px] font-medium text-[#141821]">{c.title}</p>
                      <p className="text-[11.5px] text-[#6b7280]">{c.meta}</p>
                      {c.tag && (
                        <span className="mt-1.5 inline-block rounded-[2px] bg-[#eef4fb] px-1.5 py-0.5 text-[10.5px] text-[#12467f]">
                          {c.tag}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )

    case 'detail':
      return (
        <Card title={block.title}>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {block.fields.map((f, i) => (
              <div key={i} className="flex justify-between gap-4 border-b border-[#eef1f5] pb-1.5">
                <dt className="text-[11.5px] text-[#6b7280]">{f.label}</dt>
                <dd className="text-right text-[12.5px] font-medium text-[#141821]">{f.value}</dd>
              </div>
            ))}
          </dl>
          {block.actions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {block.actions.map((a, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onGo(a.target)}
                  className={clsx(
                    'rounded-[3px] px-3 py-1.5 text-[12.5px] font-medium',
                    i === 0
                      ? 'bg-[#12467f] text-white hover:bg-[#0e3763]'
                      : 'border border-[#cbd2dc] bg-white text-[#374151] hover:bg-[#f4f6f9]',
                  )}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </Card>
      )

    case 'timeline':
      return (
        <Card title={block.title}>
          <ol className="flex flex-col">
            {block.events.map((e, i) => (
              <li key={i} className="flex gap-3 border-l-2 border-[#dfe3ea] pl-3 pb-3 last:pb-0">
                <span className="w-[96px] shrink-0 text-[11.5px] text-[#6b7280]">{e.when}</span>
                <span className="flex-1 text-[12.5px] text-[#1f2430]">
                  {e.what} <span className="text-[#6b7280]">— {e.who}</span>
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )

    case 'chart': {
      const max = Math.max(...block.series.map((s) => s.value), 1)
      return (
        <Card title={block.title}>
          <div className="flex flex-col gap-2">
            {block.series.map((s, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-[140px] shrink-0 truncate text-[12px] text-[#4b5563]">{s.label}</span>
                <span className="h-4 flex-1 overflow-hidden rounded-[2px] bg-[#eef1f5]">
                  <span
                    className="block h-full bg-[#3b74b5]"
                    style={{ width: `${Math.round((s.value / max) * 100)}%` }}
                  />
                </span>
                <span className="w-[76px] shrink-0 text-right text-[12px] tabular-nums text-[#141821]">
                  {s.value.toLocaleString()} {block.unit}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )
    }

    case 'list':
      return (
        <Card title={block.title}>
          <ul className="flex flex-col">
            {block.items.map((it, i) => (
              <li key={i} className="flex items-center gap-3 border-b border-[#eef1f5] py-2 last:border-0">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium text-[#141821]">{it.primary}</span>
                  <span className="block truncate text-[11.5px] text-[#6b7280]">{it.secondary}</span>
                </span>
                {it.badge && <Pill>{it.badge}</Pill>}
              </li>
            ))}
          </ul>
        </Card>
      )
  }
}

const INPUT =
  'w-full rounded-[3px] border border-[#cbd2dc] bg-white px-2.5 py-1.5 text-[12.5px] text-[#1f2430] placeholder:text-[#9aa3af] focus:border-[#12467f] focus:outline-none focus:ring-1 focus:ring-[#12467f]'

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[3px] border border-[#e3e7ee] bg-white">
      <h3 className="border-b border-[#eef1f5] px-3.5 py-2 text-[12.5px] font-semibold text-[#141821]">{title}</h3>
      <div className="p-3.5">{children}</div>
    </section>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block shrink-0 rounded-[2px] border border-[#d5dce6] bg-[#f2f5f9] px-2 py-0.5 text-[11px] font-medium text-[#3f4a5a]">
      {children}
    </span>
  )
}
