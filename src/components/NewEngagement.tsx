'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button, Label } from './ui'

export function NewEngagement() {
  const router = useRouter()
  const [client, setClient] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/engagements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client, name }),
      })
      const body = (await res.json()) as { id?: string; error?: string }
      if (!res.ok || !body.id) {
        setError(body.error ?? 'The engagement could not be created.')
        return
      }
      router.push(`/e/${body.id}/sources`)
    } catch {
      setError('The server did not respond. Is the dev server still running?')
    } finally {
      setBusy(false)
    }
  }

  const ready = client.trim().length > 0 && name.trim().length > 0

  return (
    <section className="panel p-4">
      <Label className="mb-3">New engagement</Label>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Client" value={client} onChange={setClient} placeholder="Nordwind Logistics AS" />
        <Field label="Engagement" value={name} onChange={setName} placeholder="Quote-to-Booking Modernisation" />
        <Button variant="primary" onClick={create} disabled={!ready || busy}>
          {busy ? 'Creating…' : 'Create'}
        </Button>
      </div>
      {error && (
        <p className="mt-3 text-[12.5px] text-[var(--flag-red)]" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  const id = `f-${label.toLowerCase()}`
  return (
    <div className="min-w-[200px] flex-1">
      <label htmlFor={id} className="ap mb-1 block">
        {label}
      </label>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-[var(--radius)] border border-[var(--ink-500)] bg-[var(--ink-900)] px-2.5 py-1.5 text-[13px] text-[var(--paper-100)] placeholder:text-[var(--paper-500)] focus:border-[var(--teal-600)]"
      />
    </div>
  )
}
