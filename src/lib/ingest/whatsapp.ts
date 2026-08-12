import { buildDisplayText, normaliseNewlines, type RawSource, type Segment } from './types'

/** iOS export: `[12/06/2026, 09:14:22] Tom: text` */
const IOS = /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)\]\s*(.*)$/
/** Android export: `12/06/2026, 09:14 - Tom: text` */
const ANDROID = /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)\s+-\s+(.*)$/

const SENDER = /^([^:]{1,60}?):\s*([\s\S]*)$/

/**
 * Lines WhatsApp itself writes. They carry a timestamp but no sender, so the
 * sender regex already rejects them — this list exists for the ones that do
 * look like `Name: something` and would otherwise be mistaken for content.
 */
const SYSTEM = [
  /end-to-end encrypted/i,
  /created (this )?group/i,
  /added you|added \+?\d/i,
  /joined using this group's invite link/i,
  /changed the (subject|group description|group icon)/i,
  /security code changed/i,
  /^<media omitted>$/i,
  /^this message was deleted$/i,
  /left$/i,
]

const isSystem = (s: string) => SYSTEM.some((r) => r.test(s.trim()))

export function parseWhatsapp(name: string, content: string): RawSource {
  const text = normaliseNewlines(content)
  const segments: Segment[] = []
  let n = 0

  for (const line of text.split('\n')) {
    const raw = line.replace(/^[‎‏]+/, '').trimEnd()
    if (!raw.trim()) continue

    const m = IOS.exec(raw.trim()) ?? ANDROID.exec(raw.trim())

    if (m) {
      const [, date, time, rest] = m
      // Timestamped but no `Sender:` prefix — that is a WhatsApp system line.
      // Dropping it here matters: without this it would be appended to the
      // previous real message as a continuation and pollute that evidence unit.
      const s = SENDER.exec(rest)
      if (!s || isSystem(rest)) continue

      const body = s[2].trim()
      if (!body || isSystem(body)) continue

      n += 1
      segments.push({
        locator: `${s[1].trim()}, msg #${n} (${date} ${time})`,
        text: body,
      })
      continue
    }

    // No timestamp: a continuation of the message above.
    const prev = segments[segments.length - 1]
    if (prev) prev.text = `${prev.text}\n${raw.trim()}`
  }

  const participants = [...new Set(segments.map((s) => s.locator.split(',')[0]))]
  return {
    type: 'whatsapp',
    name,
    text: buildDisplayText(segments),
    segments,
    meta: { messages: segments.length, participants: participants.join(', ') },
  }
}

/** Cheap sniff used by detectType before a .txt is assigned a parser. */
export function looksLikeWhatsapp(content: string): boolean {
  const head = normaliseNewlines(content).split('\n').slice(0, 40)
  const hits = head.filter((l) => {
    const t = l.replace(/^[‎‏]+/, '').trim()
    return IOS.test(t) || ANDROID.test(t)
  }).length
  return hits >= 2
}
