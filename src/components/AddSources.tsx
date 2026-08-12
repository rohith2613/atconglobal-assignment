'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import clsx from 'clsx'
import { Button, Label } from './ui'

const ACCEPTED = '.txt,.vtt,.srt,.md,.pdf,.png,.jpg,.jpeg,.webp,.mp3,.m4a,.wav,.ogg,.html'

export function AddSources({ engagementId }: { engagementId: string }) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState('')
  const [result, setResult] = useState<{ added: number; rejected: { name: string; reason: string }[] } | null>(null)

  async function send(form: FormData) {
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch(`/api/engagements/${engagementId}/sources`, { method: 'POST', body: form })
      const body = (await res.json()) as {
        added?: unknown[]
        rejected?: { name: string; reason: string }[]
        error?: string
      }
      setResult({ added: body.added?.length ?? 0, rejected: body.rejected ?? [] })
      router.refresh()
    } catch {
      setResult({ added: 0, rejected: [{ name: 'upload', reason: 'The server did not respond.' }] })
    } finally {
      setBusy(false)
    }
  }

  function addFiles(files: FileList | null) {
    if (!files?.length) return
    const form = new FormData()
    for (const f of Array.from(files)) form.append('file', f)
    void send(form)
  }

  function addUrl() {
    if (!url.trim()) return
    const form = new FormData()
    form.append('url', url.trim())
    setUrl('')
    void send(form)
  }

  return (
    <section>
      <Label className="mb-2">Add material</Label>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          addFiles(e.dataTransfer.files)
        }}
        className={clsx(
          'rounded-[var(--radius)] border border-dashed px-6 py-8 text-center transition-colors',
          over
            ? 'border-[var(--amber-400)] bg-[color-mix(in_srgb,var(--amber-wash)_40%,transparent)]'
            : 'border-[var(--ink-500)] bg-[var(--ink-850)]',
        )}
      >
        <p className="text-[13.5px] text-[var(--paper-200)]">
          Drop transcripts, chat exports, PDFs, screenshots or call recordings here
        </p>
        <p className="ap mt-1.5">
          .txt · .vtt · whatsapp export · .pdf · .png · .jpg · .mp3 · .m4a · .wav · .md · .html
        </p>
        <div className="mt-3">
          <Button onClick={() => input.current?.click()} disabled={busy}>
            {busy ? 'Adding…' : 'Choose files'}
          </Button>
        </div>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPTED}
          className="sr-only"
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      <div className="mt-3 flex items-end gap-3">
        <div className="flex-1">
          <label htmlFor="src-url" className="ap mb-1 block">
            Or reference their website
          </label>
          <input
            id="src-url"
            value={url}
            placeholder="https://nordwind.example/"
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addUrl()}
            className="w-full rounded-[var(--radius)] border border-[var(--ink-500)] bg-[var(--ink-900)] px-2.5 py-1.5 text-[13px] text-[var(--paper-100)] placeholder:text-[var(--paper-500)] focus:border-[var(--teal-600)]"
          />
        </div>
        <Button onClick={addUrl} disabled={busy || !url.trim()}>
          Add reference
        </Button>
      </div>

      {result && (
        <div className="mt-3" role="status">
          {result.added > 0 && (
            <p className="text-[12.5px] text-[var(--flag-green)]">
              Added {result.added} {result.added === 1 ? 'source' : 'sources'}. Run the analysis to read them.
            </p>
          )}
          {result.rejected.map((r) => (
            <p key={r.name} className="text-[12.5px] text-[var(--flag-red)]">
              {r.name} — {r.reason}
            </p>
          ))}
        </div>
      )}
    </section>
  )
}
