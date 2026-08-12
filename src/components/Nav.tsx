'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'
import type { EngagementData } from '@/lib/pipeline/run'

/**
 * The rail is ordered as the work is done: what came in, what it means, what is
 * wrong with it, what is missing, what to do about it, and what it looks like.
 * The numbering is real — it is the pipeline order, not decoration.
 */
export const SECTIONS = [
  { slug: 'sources', n: '01', label: 'Sources', hint: 'What the client gave us' },
  { slug: 'brief', n: '02', label: 'Discovery brief', hint: 'What they need' },
  { slug: 'conflicts', n: '03', label: 'Contradictions', hint: 'Where sources disagree' },
  { slug: 'gaps', n: '04', label: 'Gap radar', hint: 'What nobody asked' },
  { slug: 'process', n: '05', label: 'As-is / To-be', hint: 'A better way of working' },
  { slug: 'blueprint', n: '06', label: 'Solution blueprint', hint: 'What to build' },
  { slug: 'poc', n: '07', label: 'Prototype', hint: 'What it looks like' },
  { slug: 'trace', n: '08', label: 'Run trace', hint: 'How it was produced' },
] as const

export function Rail({ id, data }: { id: string; data: EngagementData }) {
  const path = usePathname()

  const counts: Record<string, number | undefined> = {
    sources: data.sources.length || undefined,
    conflicts: data.conflicts.length || undefined,
    gaps: data.gaps.filter((g) => g.status === 'MISSING').length || undefined,
    blueprint: data.blueprint?.features.length,
    poc: data.appspec?.screens.length,
    trace: data.trace.length || undefined,
  }

  const review = new Set(data.review?.needsHumanReview ?? [])
  const flagged: Record<string, boolean> = {
    brief: review.has('synthesize'),
    blueprint: review.has('blueprint'),
    poc: review.has('poc'),
  }

  return (
    <nav
      aria-label="Engagement sections"
      className="flex w-[var(--rail)] shrink-0 flex-col border-r border-[var(--ink-600)] bg-[var(--ink-850)]"
    >
      <Link
        href="/"
        className="flex items-baseline gap-2 border-b border-[var(--ink-600)] px-4 py-3.5 hover:bg-[var(--ink-800)]"
      >
        <span className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--paper-100)]">Prism</span>
        <span className="ap">discovery → poc</span>
      </Link>

      <div className="border-b border-[var(--ink-600)] px-4 py-3">
        <p className="truncate text-[13px] font-medium text-[var(--paper-100)]" title={data.engagement?.client}>
          {data.engagement?.client ?? 'Engagement'}
        </p>
        <p className="ap mt-0.5 truncate">{data.engagement?.name}</p>
      </div>

      <ul className="flex-1 overflow-y-auto py-2">
        {SECTIONS.map((s) => {
          const href = `/e/${id}/${s.slug}`
          const active = path === href
          return (
            <li key={s.slug}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'group flex items-baseline gap-2.5 border-l-2 px-4 py-[7px] transition-colors',
                  active
                    ? 'border-[var(--amber-400)] bg-[var(--ink-750)]'
                    : 'border-transparent hover:border-[var(--ink-400)] hover:bg-[var(--ink-800)]',
                )}
              >
                <span className={clsx('ap w-[18px] shrink-0', active && 'text-[var(--amber-400)]')}>{s.n}</span>
                <span className="min-w-0 flex-1">
                  <span
                    className={clsx(
                      'block truncate text-[13px]',
                      active ? 'font-medium text-[var(--paper-100)]' : 'text-[var(--paper-300)]',
                    )}
                  >
                    {s.label}
                  </span>
                  <span className="ap block truncate text-[9.5px] opacity-70">{s.hint}</span>
                </span>
                {flagged[s.slug] && (
                  <span className="shrink-0 text-[10px] text-[var(--flag-amber)]" title="Needs human review">
                    ⚑
                  </span>
                )}
                {counts[s.slug] !== undefined && (
                  <span className="id tabular shrink-0 text-[10.5px] opacity-80">{counts[s.slug]}</span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>

      <div className="border-t border-[var(--ink-600)] px-4 py-2.5">
        <p className="ap">
          {data.hasKey ? 'live · api key present' : 'demo · cached run, no key'}
        </p>
      </div>
    </nav>
  )
}
