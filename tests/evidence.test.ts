import { describe, it, expect } from 'vitest'
import { segment, Corpus, normaliseForCompare } from '@/lib/evidence'
import { parseTranscript } from '@/lib/ingest/transcript'
import type { RawSource } from '@/lib/ingest/types'

const raw: RawSource = {
  type: 'transcript',
  name: 't.txt',
  text: 'We quote by hand.\nForty a day.',
  meta: {},
  segments: [
    { locator: 'Priya @ 00:00:12', text: 'We quote by hand.' },
    { locator: 'Priya @ 00:00:24', text: 'Forty a day.' },
  ],
}

describe('segment', () => {
  it('assigns stable zero-padded ids in document order', () => {
    expect(segment(raw, 'eng1', 'src1').map((u) => u.id)).toEqual(['E-src1-001', 'E-src1-002'])
  })

  it('is deterministic across calls, so citations survive a re-run', () => {
    expect(segment(raw, 'eng1', 'src1')).toEqual(segment(raw, 'eng1', 'src1'))
  })

  it('records char offsets that slice back to the segment text', () => {
    for (const u of segment(raw, 'eng1', 'src1')) {
      expect(raw.text.slice(u.charStart, u.charEnd)).toBe(u.text)
    }
  })

  it('scans forward, so a repeated phrase does not collapse onto its first occurrence', () => {
    // Three people saying "Yes." would otherwise all point at the first "Yes."
    // and the drawer would highlight the wrong line every time.
    const repeated = parseTranscript(
      'm.txt',
      `[00:00:01] A: Yes.
[00:00:05] B: Yes.
[00:00:09] C: Yes.`,
    )
    const units = segment(repeated, 'eng1', 'src1')
    const starts = units.map((u) => u.charStart)
    expect(new Set(starts).size).toBe(3)
    for (const u of units) expect(repeated.text.slice(u.charStart, u.charEnd)).toBe(u.text)
  })

  it('carries the source type onto every unit', () => {
    expect(segment(raw, 'eng1', 'src1').every((u) => u.sourceType === 'transcript')).toBe(true)
  })
})

describe('normaliseForCompare', () => {
  it('folds smart quotes and collapses whitespace', () => {
    expect(normaliseForCompare('  “Don’t”   do  it ')).toBe('"don\'t" do it')
  })

  it('folds dash variants and non-breaking spaces', () => {
    expect(normaliseForCompare('Q1 — Q2')).toBe('q1 - q2')
  })

  it('never alters words or numbers', () => {
    expect(normaliseForCompare('Forty (40) users, €12,500')).toBe('forty (40) users, €12,500')
  })
})

describe('Corpus.supportsQuote', () => {
  const c = new Corpus(segment(raw, 'eng1', 'src1'))

  it('accepts an exact quote', () => {
    expect(c.supportsQuote('E-src1-001', 'We quote by hand.')).toBe(true)
  })

  it('accepts a quote differing only in whitespace, case and quote glyphs', () => {
    expect(c.supportsQuote('E-src1-001', '  we  QUOTE by hand ')).toBe(true)
  })

  it('accepts a partial quote that is genuinely inside the unit', () => {
    expect(c.supportsQuote('E-src1-001', 'quote by hand')).toBe(true)
  })

  it('rejects a quote that is not present — this is the fabrication check', () => {
    expect(c.supportsQuote('E-src1-001', 'we use SAP')).toBe(false)
  })

  it('rejects a quote that mixes real words into a claim never made', () => {
    expect(c.supportsQuote('E-src1-001', 'We quote by hand in SAP.')).toBe(false)
  })

  it('rejects an unknown evidence id', () => {
    expect(c.supportsQuote('E-nope-999', 'anything')).toBe(false)
  })

  it('rejects an empty quote', () => {
    expect(c.supportsQuote('E-src1-001', '   ')).toBe(false)
  })
})

describe('Corpus.supportsQuoteAcross', () => {
  const c = new Corpus(segment(raw, 'eng1', 'src1'))

  it('accepts a quote spanning two cited units', () => {
    // A claim drawn from two adjacent turns cites both and quotes across the
    // join. Rejecting that would push the model toward citing less than it used.
    expect(c.supportsQuoteAcross(['E-src1-001', 'E-src1-002'], 'We quote by hand. Forty a day.')).toBe(
      true,
    )
  })

  it('accepts an elided quote when both halves are present and in order', () => {
    expect(c.supportsQuoteAcross(['E-src1-001', 'E-src1-002'], 'We quote ... Forty a day')).toBe(true)
  })

  it('rejects an elided quote whose halves are out of order', () => {
    expect(c.supportsQuoteAcross(['E-src1-001', 'E-src1-002'], 'Forty a day ... We quote')).toBe(false)
  })

  it('rejects when none of the cited ids exist', () => {
    expect(c.supportsQuoteAcross(['E-ghost-001'], 'We quote by hand.')).toBe(false)
  })

  it('rejects an empty citation list', () => {
    expect(c.supportsQuoteAcross([], 'We quote by hand.')).toBe(false)
  })
})

describe('Corpus renderings', () => {
  const c = new Corpus(segment(raw, 'eng1', 'src1'))

  it('fullText gives the extractor ids alongside exact words to quote', () => {
    const t = c.fullText('src1')
    expect(t).toContain('E-src1-001 [Priya @ 00:00:12]')
    expect(t).toContain('We quote by hand.')
  })

  it('outline truncates long units but keeps every id', () => {
    const long = new Corpus(
      segment(
        {
          ...raw,
          text: 'x'.repeat(400),
          segments: [{ locator: 'L', text: 'x'.repeat(400) }],
        },
        'eng1',
        'src1',
      ),
    )
    const o = long.outline()
    expect(o).toContain('E-src1-001')
    expect(o).toContain('...')
    expect(o.length).toBeLessThan(300)
  })

  it('outline says how many units it dropped rather than truncating silently', () => {
    const many = new Corpus(
      segment(
        {
          ...raw,
          text: 'abc',
          segments: Array.from({ length: 200 }, (_, i) => ({ locator: `L${i}`, text: 'abc' })),
        },
        'eng1',
        'src1',
      ),
    )
    expect(many.outline(500)).toContain('further units omitted')
  })

  it('reports its size and looks up by source', () => {
    expect(c.size).toBe(2)
    expect(c.bySource('src1')).toHaveLength(2)
    expect(c.bySource('nope')).toHaveLength(0)
  })
})
