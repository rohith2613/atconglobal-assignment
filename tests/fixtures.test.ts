import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { parsePdf } from '@/lib/ingest/pdf'
import { parseTranscript } from '@/lib/ingest/transcript'
import { parseWhatsapp } from '@/lib/ingest/whatsapp'
import { parseHtml } from '@/lib/ingest/website'
import { detectType } from '@/lib/ingest'
import { segment, Corpus } from '@/lib/evidence'

const F = 'fixtures/nordwind'
const read = (f: string) => readFileSync(`${F}/${f}`, 'utf8')

const ALL_TEXT = ['transcript-kickoff.txt', 'transcript-followup.txt', 'whatsapp-ops-group.txt']

describe('corpus is complete', () => {
  it.each([
    'transcript-kickoff.txt',
    'transcript-followup.txt',
    'whatsapp-ops-group.txt',
    'website.html',
    'quotation-sop-v3.2.pdf',
    'call-with-erik.mp3',
    'screen-1-nordquote-quotation-entry.png',
    'screen-2-carrier-rate-sheet.png',
    'screen-3-shared-quotes-mailbox.png',
    'manifest.json',
  ])('ships %s', (f) => {
    expect(existsSync(`${F}/${f}`), `${f} is missing — run npm run fixtures`).toBe(true)
  })

  it('covers all seven ingest types between the corpus and the ingest layer', () => {
    const manifest = JSON.parse(read('manifest.json')) as { sources: { type: string }[] }
    const types = new Set(manifest.sources.map((s) => s.type))
    // 'notes' is the seventh; it is exercised by unit tests rather than the
    // corpus, because a consultant's own notes are not a client artefact.
    expect([...types].sort()).toEqual(['audio', 'pdf', 'screenshot', 'transcript', 'website', 'whatsapp'])
  })

  it('the audio is real audio, not a placeholder', () => {
    const mp3 = statSync(`${F}/call-with-erik.mp3`)
    expect(mp3.size).toBeGreaterThan(200_000)
    expect(readFileSync(`${F}/call-with-erik.mp3`).subarray(0, 3).toString('hex')).toMatch(/^(fffb|4944|fff3)/)
  })

  it('labels itself synthetic — a fabricated client must never read as a real one', () => {
    const m = JSON.parse(read('manifest.json')) as { synthetic: boolean; note: string }
    expect(m.synthetic).toBe(true)
    expect(m.note).toContain('does not exist')
  })
})

describe('planted contradictions are really in the text', () => {
  it('the October claim is in the WhatsApp export', () => {
    expect(read('whatsapp-ops-group.txt')).toContain('end of October')
  })

  it('the Q1 claim is in the second transcript', () => {
    expect(read('transcript-followup.txt')).toContain('Q1 next year')
  })

  it('the forty-user claim is in the first transcript', () => {
    expect(read('transcript-kickoff.txt')).toContain('forty users')
  })

  it('the twelve-staff claim is in the SOP source', () => {
    expect(readFileSync(`${F}/_source/quotation-sop.md`, 'utf8')).toContain('12 staff across 3 branches')
  })

  it('and survives the PDF round trip, so the extractor can actually see it', async () => {
    const pdf = await parsePdf('sop.pdf', readFileSync(`${F}/quotation-sop-v3.2.pdf`))
    expect(pdf.text).toContain('12 staff across 3 branches')
    expect(pdf.segments.length).toBeGreaterThan(20)
  })

  it('no single source contains both sides of the timeline contradiction', () => {
    // This is the whole point. A contradiction that lives inside one document
    // is a proofreading job; one that only exists across the corpus is the
    // thing a consultant reading files one at a time actually misses.
    for (const f of ALL_TEXT) {
      const t = read(f)
      expect(t.includes('end of October') && t.includes('Q1 next year'), f).toBe(false)
    }
  })
})

describe('planted gaps are genuinely absent', () => {
  const everything = [...ALL_TEXT.map(read), read('website.html')].join('\n').toLowerCase()

  it.each([
    ['data residency', /data residenc/],
    ['single sign-on / SSO', /\bsso\b|single sign[- ]on/],
    ['a stated success metric', /win rate of|success (metric|criteria) (is|are)/],
  ])('%s is never mentioned', (_label, re) => {
    expect(re.test(everything)).toBe(false)
  })

  it('names Winfreight but never says what it exposes', () => {
    // The most realistic kind of gap: the system is discussed constantly and
    // the one fact you need to plan the integration is missing.
    expect(everything).toContain('winfreight')
    expect(/winfreight[^.]{0,80}(rest|soap|api endpoint|swagger|documented)/.test(everything)).toBe(false)
    expect(read('transcript-followup.txt')).toContain("I don't know what it is")
  })
})

describe('the corpus parses into a usable evidence base', () => {
  it('produces enough distinct, citable units to reason over', async () => {
    const units = [
      ...segment(parseTranscript('kickoff.txt', read('transcript-kickoff.txt')), 'e', 's1'),
      ...segment(parseTranscript('followup.txt', read('transcript-followup.txt')), 'e', 's2'),
      ...segment(parseWhatsapp('wa.txt', read('whatsapp-ops-group.txt')), 'e', 's3'),
      ...segment(await parsePdf('sop.pdf', readFileSync(`${F}/quotation-sop-v3.2.pdf`)), 'e', 's4'),
      ...segment(parseHtml('https://nordwind.no/', read('website.html')), 'e', 's5'),
    ]
    const corpus = new Corpus(units)

    expect(corpus.size).toBeGreaterThan(120)
    expect(new Set(units.map((u) => u.id)).size).toBe(units.length)
    expect(new Set(units.map((u) => u.sourceType)).size).toBe(4)
  })

  it('detects each file as the type the manifest claims', () => {
    const manifest = JSON.parse(read('manifest.json')) as { sources: { file: string; type: string }[] }
    for (const s of manifest.sources) {
      if (s.type === 'screenshot' || s.type === 'audio') continue
      const buf = readFileSync(`${F}/${s.file}`)
      expect(detectType(s.file, buf), s.file).toBe(s.type)
    }
  })

  it('every quote a validator will check is findable in its own source', () => {
    const t1 = parseTranscript('kickoff.txt', read('transcript-kickoff.txt'))
    const corpus = new Corpus(segment(t1, 'e', 's1'))
    const unit = corpus.units.find((u) => u.text.includes('forty users'))!
    expect(corpus.supportsQuote(unit.id, 'About forty users all in')).toBe(true)
    expect(corpus.supportsQuote(unit.id, 'About four hundred users all in')).toBe(false)
  })
})
