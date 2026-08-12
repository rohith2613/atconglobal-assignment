import { buildDisplayText, normaliseNewlines, type RawSource, type Segment } from './types'

/** `[00:14:32] Priya Nair: text` — the Teams/Zoom plain-text export shape. */
const BRACKETED = /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*([^:]{1,60}?):\s*(.*)$/
/** `Priya Nair (00:14:32): text` — the other common shape. */
const PARENTHESISED = /^([^:(]{1,60}?)\s*\((\d{1,2}:\d{2}(?::\d{2})?)\):\s*(.*)$/
/** `Priya Nair: text` — no timestamps at all. */
const BARE = /^([A-Z][^:]{0,58}?):\s+(.+)$/

const VTT_CUE = /^(\d{2}:\d{2}:\d{2})[.,]\d{3}\s+-->/
const VTT_VOICE = /^<v\s+([^>]+)>(.*)$/

function pad(ts: string): string {
  // "0:14" reads badly next to "00:00:14"; normalise to h:mm:ss where possible.
  const parts = ts.split(':')
  if (parts.length === 2) return `00:${parts[0].padStart(2, '0')}:${parts[1]}`
  return parts.map((p, i) => (i === 0 ? p.padStart(2, '0') : p)).join(':')
}

function isVtt(text: string): boolean {
  return /^\s*WEBVTT/.test(text)
}

function parseVtt(text: string): Segment[] {
  const out: Segment[] = []
  const lines = text.split('\n')
  let stamp = ''

  for (const line of lines) {
    const cue = VTT_CUE.exec(line.trim())
    if (cue) {
      stamp = cue[1]
      continue
    }
    const t = line.trim()
    if (!t || t === 'WEBVTT' || /^\d+$/.test(t)) continue

    const voice = VTT_VOICE.exec(t)
    const speaker = voice ? voice[1].trim() : 'Speaker'
    const body = (voice ? voice[2] : t).replace(/<[^>]+>/g, '').trim()
    if (!body) continue

    out.push({ locator: `${speaker} @ ${stamp || '00:00:00'}`, text: body })
  }
  return out
}

/**
 * Consecutive turns by the same speaker are merged. A speaker who pauses mid
 * thought produces three transcript lines that are one idea, and splitting them
 * into three evidence units makes every one of them individually uncitable.
 */
function mergeRuns(segments: Segment[]): Segment[] {
  const out: Segment[] = []
  for (const s of segments) {
    const prev = out[out.length - 1]
    const speaker = s.locator.split(' @ ')[0]
    const prevSpeaker = prev ? prev.locator.split(' @ ')[0] : null
    if (prev && speaker === prevSpeaker) {
      prev.text = `${prev.text} ${s.text}`.trim()
    } else {
      out.push({ ...s })
    }
  }
  return out
}

export function parseTranscript(name: string, content: string): RawSource {
  const text = normaliseNewlines(content)
  let segments: Segment[]

  if (isVtt(text)) {
    segments = parseVtt(text)
  } else {
    segments = []
    for (const line of text.split('\n')) {
      const raw = line.trim()
      if (!raw) continue

      const b = BRACKETED.exec(raw)
      if (b) {
        segments.push({ locator: `${b[2].trim()} @ ${pad(b[1])}`, text: b[3].trim() })
        continue
      }
      const p = PARENTHESISED.exec(raw)
      if (p) {
        segments.push({ locator: `${p[1].trim()} @ ${pad(p[2])}`, text: p[3].trim() })
        continue
      }
      const s = BARE.exec(raw)
      if (s && !raw.startsWith('http')) {
        segments.push({ locator: s[1].trim(), text: s[2].trim() })
        continue
      }

      // An unmatched line continues the previous turn. Wrapped paragraphs are
      // common in exports and must not become their own speakerless units.
      const prev = segments[segments.length - 1]
      if (prev) prev.text = `${prev.text} ${raw}`.trim()
    }
  }

  segments = mergeRuns(segments).filter((s) => s.text.length > 0)

  const speakers = [...new Set(segments.map((s) => s.locator.split(' @ ')[0]))]
  return {
    type: 'transcript',
    name,
    text: buildDisplayText(segments),
    segments,
    meta: {
      turns: segments.length,
      speakers: speakers.join(', '),
      format: isVtt(text) ? 'webvtt' : 'plain',
    },
  }
}
