'use client'

import { useState } from 'react'
import clsx from 'clsx'
import type { AppSpec } from '@/lib/schema/appspec'
import { PocRenderer } from './PocRenderer'
import { Label } from '../ui'

const WIDTHS = {
  desktop: { w: '100%', label: 'Desktop' },
  tablet: { w: '834px', label: 'Tablet' },
  phone: { w: '390px', label: 'Phone' },
} as const

type Size = keyof typeof WIDTHS

/**
 * The prototype in a device frame. The widths are real breakpoints rather than
 * decoration: a quotation desk works at a desk and a warehouse user does not,
 * and the client will ask.
 */
export function PocFrame({ spec, blueprintRoles }: { spec: AppSpec; blueprintRoles: string[] }) {
  const [size, setSize] = useState<Size>('desktop')

  const invented = spec.roles
    .map((r) => r.name)
    .filter((n) => blueprintRoles.length > 0 && !blueprintRoles.some((b) => b.toLowerCase() === n.toLowerCase()))

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <Label>Live prototype</Label>
        <div className="flex gap-0.5" role="group" aria-label="Viewport size">
          {(Object.keys(WIDTHS) as Size[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSize(s)}
              aria-pressed={size === s}
              className={clsx(
                'rounded-[2px] border px-2.5 py-1 font-[family-name:var(--mono)] text-[10.5px] uppercase tracking-[0.07em] transition-colors',
                size === s
                  ? 'border-[var(--teal-600)] bg-[color-mix(in_srgb,var(--teal-400)_16%,transparent)] text-[var(--teal-300)]'
                  : 'border-[var(--ink-500)] bg-[var(--ink-700)] text-[var(--paper-400)] hover:text-[var(--paper-200)]',
              )}
            >
              {WIDTHS[s].label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-center rounded-[var(--radius)] border border-[var(--ink-600)] bg-[var(--ink-900)] p-4">
        <div style={{ width: WIDTHS[size].w, maxWidth: '100%' }} className="transition-[width] duration-300">
          <PocRenderer spec={spec} />
        </div>
      </div>

      {invented.length > 0 && (
        <p className="mt-2 text-[12.5px] text-[var(--flag-amber)]">
          The prototype introduces {invented.join(', ')}, which the blueprint did not identify. Worth confirming
          the role exists before showing this.
        </p>
      )}
    </div>
  )
}
