import { describe, it, expect } from 'vitest'
import { parseTranscript } from '@/lib/ingest/transcript'
import { parseWhatsapp } from '@/lib/ingest/whatsapp'
import { parseNotes } from '@/lib/ingest/notes'
import { parseHtml } from '@/lib/ingest/website'
import { detectType, ingest } from '@/lib/ingest'
import { buildDisplayText } from '@/lib/ingest/types'

describe('transcript parser', () => {
  it('splits speaker turns and keeps the timestamp in the locator', () => {
    const r = parseTranscript(
      'meeting.txt',
      `[00:00:12] Priya Nair: We quote everything by hand.
[00:00:20] Tom De Vries: Roughly how many a day?
[00:00:24] Priya Nair: Forty, fifty on a bad day.`,
    )
    expect(r.segments).toHaveLength(3)
    expect(r.segments[0].locator).toBe('Priya Nair @ 00:00:12')
    expect(r.segments[2].text).toBe('Forty, fifty on a bad day.')
  })

  it('merges consecutive turns by the same speaker into one citable unit', () => {
    const r = parseTranscript('m.txt', `[00:01:00] Priya Nair: One.
[00:01:04] Priya Nair: Two.`)
    expect(r.segments).toHaveLength(1)
    expect(r.segments[0].text).toBe('One. Two.')
  })

  it('attaches a wrapped continuation line to the turn above it', () => {
    const r = parseTranscript('m.txt', `[00:01:00] Priya Nair: The quote goes out
by email, always.
[00:01:20] Tom De Vries: Right.`)
    expect(r.segments).toHaveLength(2)
    expect(r.segments[0].text).toBe('The quote goes out by email, always.')
  })

  it('normalises a two-part timestamp to h:mm:ss', () => {
    const r = parseTranscript('m.txt', '[4:07] Priya Nair: Later in the call.')
    expect(r.segments[0].locator).toBe('Priya Nair @ 00:04:07')
  })

  it('parses the parenthesised speaker form', () => {
    const r = parseTranscript('m.txt', 'Priya Nair (00:02:15): Another shape entirely.')
    expect(r.segments[0].locator).toBe('Priya Nair @ 00:02:15')
    expect(r.segments[0].text).toBe('Another shape entirely.')
  })

  it('parses WebVTT with voice tags', () => {
    const r = parseTranscript(
      'm.vtt',
      `WEBVTT

1
00:00:05.000 --> 00:00:09.000
<v Priya Nair>We quote by hand.

2
00:00:10.000 --> 00:00:14.000
<v Tom De Vries>How many?`,
    )
    expect(r.segments).toHaveLength(2)
    expect(r.segments[0].locator).toBe('Priya Nair @ 00:00:05')
    expect(r.segments[1].text).toBe('How many?')
    expect(r.meta.format).toBe('webvtt')
  })

  it('records the speaker roster in meta', () => {
    const r = parseTranscript('m.txt', `[00:00:01] A: x
[00:00:02] B: y`)
    expect(r.meta.speakers).toBe('A, B')
  })
})

describe('whatsapp parser', () => {
  it('parses the iOS bracketed export and numbers messages', () => {
    const r = parseWhatsapp(
      'chat.txt',
      `[12/06/2026, 09:14] Tom: board wants it live before peak season
[12/06/2026, 09:15] Priya: that's end of October, not going to happen
[12/06/2026, 09:15] Priya: we don't even have the TMS docs`,
    )
    expect(r.segments).toHaveLength(3)
    expect(r.segments[0].locator).toBe('Tom, msg #1 (12/06/2026 09:14)')
    expect(r.segments[2].text).toContain('TMS docs')
  })

  it('parses the Android dash export', () => {
    const r = parseWhatsapp('chat.txt', '12/06/2026, 09:14 - Tom: android shape')
    expect(r.segments).toHaveLength(1)
    expect(r.segments[0].text).toBe('android shape')
  })

  it('attaches continuation lines to the preceding message', () => {
    const r = parseWhatsapp('c.txt', `[12/06/2026, 09:14] Tom: first line
continued here
[12/06/2026, 09:20] Priya: second`)
    expect(r.segments).toHaveLength(2)
    expect(r.segments[0].text).toBe('first line\ncontinued here')
  })

  it('drops system lines', () => {
    const r = parseWhatsapp(
      'c.txt',
      `[12/06/2026, 09:00] Messages are end-to-end encrypted.
[12/06/2026, 09:14] Tom: real message`,
    )
    expect(r.segments).toHaveLength(1)
    expect(r.segments[0].text).toBe('real message')
  })

  it('does not let a mid-chat system line pollute the message above it', () => {
    // Without an explicit drop, a timestamped line with no "Name:" would be
    // treated as a continuation and glued onto the previous evidence unit.
    const r = parseWhatsapp(
      'c.txt',
      `[12/06/2026, 09:14] Tom: the real content
[12/06/2026, 09:16] Priya added Marcus
[12/06/2026, 09:20] Priya: next message`,
    )
    expect(r.segments).toHaveLength(2)
    expect(r.segments[0].text).toBe('the real content')
  })

  it('records participants in meta', () => {
    const r = parseWhatsapp('c.txt', `[12/06/2026, 09:14] Tom: a
[12/06/2026, 09:15] Priya: b`)
    expect(r.meta.participants).toBe('Tom, Priya')
    expect(r.meta.messages).toBe(2)
  })
})

describe('notes parser', () => {
  it('carries the nearest heading into the locator', () => {
    const r = parseNotes(
      'notes.md',
      `# Escalation rules

If a quote exceeds 50k it goes to the branch manager.

Anything under that the desk decides.`,
    )
    expect(r.segments[1].locator).toBe('Escalation rules ¶1')
    expect(r.segments[2].locator).toBe('Escalation rules ¶2')
  })

  it('falls back to a paragraph number with no headings present', () => {
    const r = parseNotes('n.txt', 'Just one paragraph of loose notes.')
    expect(r.segments[0].locator).toMatch(/^¶\d+$/)
  })
})

describe('website parser', () => {
  const html = `<!doctype html><html><head><title>Nordwind Logistics</title>
    <meta name="description" content="Freight forwarding across Northern Europe."></head>
    <body>
      <nav>Home About Contact</nav>
      <h1>Moving freight since 1994</h1>
      <p>We arrange sea, air and road freight for mid-market exporters in Norway and the Netherlands.</p>
      <h2>Services</h2>
      <p>Customs clearance, warehousing and last-mile delivery across the region.</p>
      <p>Customs clearance, warehousing and last-mile delivery across the region.</p>
      <script>console.log('ignored')</script>
      <footer>© 1994</footer>
    </body></html>`

  it('extracts the meta description as its own citable unit', () => {
    const r = parseHtml('https://nordwind.example/', html)
    expect(r.segments[0].text).toBe('Freight forwarding across Northern Europe.')
  })

  it('strips nav, footer and script chrome', () => {
    const r = parseHtml('https://nordwind.example/', html)
    const all = r.segments.map((s) => s.text).join(' ')
    expect(all).not.toContain('ignored')
    expect(all).not.toContain('Home About Contact')
  })

  it('locates body text under the heading above it', () => {
    const r = parseHtml('https://nordwind.example/', html)
    const customs = r.segments.find((s) => s.text.startsWith('Customs clearance'))
    expect(customs?.locator).toBe('Nordwind Logistics · Services')
  })

  it('deduplicates repeated blocks so corroboration counts are not inflated', () => {
    const r = parseHtml('https://nordwind.example/', html)
    const customs = r.segments.filter((s) => s.text.startsWith('Customs clearance'))
    expect(customs).toHaveLength(1)
  })
})

describe('detectType', () => {
  it.each([
    ['chat.txt', '[12/06/2026, 09:14] Tom: hi\n[12/06/2026, 09:15] Priya: yes', 'whatsapp'],
    ['meeting.vtt', 'WEBVTT', 'transcript'],
    ['meeting.txt', '[00:00:12] Priya: hi\n[00:00:20] Tom: yes', 'transcript'],
    ['sop.pdf', '%PDF-1.4', 'pdf'],
    ['ui.png', '', 'screenshot'],
    ['call.mp3', '', 'audio'],
    ['notes.md', '# notes', 'notes'],
    ['loose.txt', 'Just some prose with no structure at all.', 'notes'],
    ['page.html', '<!doctype html><html></html>', 'website'],
  ])('%s → %s', (name, body, expected) => {
    expect(detectType(name, Buffer.from(body))).toBe(expected)
  })

  it('trusts PDF magic bytes over a wrong extension', () => {
    expect(detectType('mislabelled.txt', Buffer.from('%PDF-1.7\n...'))).toBe('pdf')
  })
})

describe('display text invariant', () => {
  // The evidence layer computes char offsets by scanning raw.text for each
  // segment in order. If that invariant ever broke, every citation in the app
  // would highlight the wrong span — silently.
  it.each([
    [
      'transcript',
      () => parseTranscript('m.txt', `[00:00:12] A: first thing said
[00:00:30] B: second thing said`),
    ],
    [
      'whatsapp',
      () => parseWhatsapp('c.txt', `[12/06/2026, 09:14] Tom: alpha
[12/06/2026, 09:15] Priya: beta`),
    ],
    ['notes', () => parseNotes('n.md', '# H\n\npara one\n\npara two')],
  ])('%s segments appear in order as literal substrings of text', (_name, build) => {
    const r = build()
    let cursor = 0
    for (const s of r.segments) {
      const at = r.text.indexOf(s.text, cursor)
      expect(at, `"${s.text.slice(0, 40)}" not found at/after ${cursor}`).toBeGreaterThanOrEqual(0)
      cursor = at + s.text.length
    }
  })

  it('buildDisplayText renders locator headers', () => {
    expect(buildDisplayText([{ locator: 'A @ 00:00:01', text: 'hello' }])).toBe('[A @ 00:00:01]\nhello')
  })
})

describe('ingest dispatch', () => {
  it('routes a text buffer to the right parser without an LLM', async () => {
    const r = await ingest({
      filename: 'chat.txt',
      buffer: Buffer.from('[12/06/2026, 09:14] Tom: a\n[12/06/2026, 09:15] Priya: b'),
      runId: 'r',
      engagementId: 'e',
    })
    expect(r.type).toBe('whatsapp')
    expect(r.segments).toHaveLength(2)
  })

  it('refuses a screenshot with no LLM rather than silently producing nothing', async () => {
    await expect(
      ingest({ filename: 'ui.png', buffer: Buffer.from(''), runId: 'r', engagementId: 'e' }),
    ).rejects.toThrow(/vision model/)
  })

  it('refuses audio with no LLM', async () => {
    await expect(
      ingest({ filename: 'call.mp3', buffer: Buffer.from(''), runId: 'r', engagementId: 'e' }),
    ).rejects.toThrow(/Whisper/)
  })
})
