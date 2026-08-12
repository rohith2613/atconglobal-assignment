import { describe, it, expect } from 'vitest'
import {
  cosine,
  candidatePairs,
  scoreConfidence,
  discardReason,
  contradictionCandidates,
} from '@/lib/pipeline/reconcile'
import { mapWithConcurrency, STAGES, STAGE_LABEL } from '@/lib/pipeline/events'
import { Corpus } from '@/lib/evidence'
import type { Conflict, Signal } from '@/lib/schema/signals'
import type { EvidenceUnit } from '@/lib/types'

const sig = (id: string, type: Signal['type'], statement: string, evidenceIds: string[] = ['E-a-001']): Signal => ({
  id,
  type,
  statement,
  detail: '',
  subject: 'quote turnaround',
  confidence: 'MEDIUM',
  citation: { evidenceIds, quote: statement },
})

describe('cosine', () => {
  it('is 1 for identical vectors', () => expect(cosine([1, 0], [1, 0])).toBeCloseTo(1))
  it('is 0 for orthogonal vectors', () => expect(cosine([1, 0], [0, 1])).toBeCloseTo(0))
  it('is scale invariant', () => expect(cosine([2, 4], [1, 2])).toBeCloseTo(1))
  it('does not divide by zero on a zero vector', () => expect(cosine([0, 0], [1, 1])).toBe(0))
})

describe('candidatePairs', () => {
  it('pairs similar same-type signals from different sources', () => {
    const s = [sig('sA:1', 'PAIN_POINT', 'quoting is slow'), sig('sB:1', 'PAIN_POINT', 'quotes take days')]
    expect(candidatePairs(s, [[1, 0], [0.99, 0.14]])).toEqual([[0, 1]])
  })

  it('never pairs across signal types', () => {
    // "get quotes out same day" and "quotes take two days" embed almost
    // identically. Merging a GOAL into a PAIN_POINT destroys the distinction
    // the entire brief is built on.
    const s = [sig('sA:1', 'GOAL', 'same day quotes'), sig('sB:1', 'PAIN_POINT', 'quotes take two days')]
    expect(candidatePairs(s, [[1, 0], [1, 0]])).toEqual([])
  })

  it('never pairs two signals from the same source', () => {
    // Within one document the model already had its chance to say it once, so
    // two similar signals there are usually a distinction it chose to draw.
    const s = [sig('sA:1', 'PAIN_POINT', 'x'), sig('sA:2', 'PAIN_POINT', 'y')]
    expect(candidatePairs(s, [[1, 0], [1, 0]])).toEqual([])
  })

  it('returns nothing below the threshold', () => {
    const s = [sig('sA:1', 'PAIN_POINT', 'x'), sig('sB:1', 'PAIN_POINT', 'y')]
    expect(candidatePairs(s, [[1, 0], [0, 1]])).toEqual([])
  })

  it('honours a custom threshold', () => {
    const s = [sig('sA:1', 'PAIN_POINT', 'x'), sig('sB:1', 'PAIN_POINT', 'y')]
    const v = [[1, 0], [0.9, 0.44]]
    expect(candidatePairs(s, v, 0.99)).toEqual([])
    expect(candidatePairs(s, v, 0.85)).toEqual([[0, 1]])
  })

  it('scales to every cross-source pair without duplicating any', () => {
    const s = ['a', 'b', 'c'].map((x) => sig(`s${x}:1`, 'REQUIREMENT', x))
    expect(candidatePairs(s, [[1, 0], [1, 0], [1, 0]])).toEqual([
      [0, 1],
      [0, 2],
      [1, 2],
    ])
  })
})

describe('contradictionCandidates', () => {
  // Reuses the dedup embeddings: a cross-source pair that is semantically close
  // but was NOT merged is either a genuine distinction or a contradiction.
  const sigs = [
    sig('sA:1', 'METRIC', 'about forty users all in'),
    sig('sB:1', 'METRIC', 'the desk is twelve staff across three branches'),
    sig('sC:1', 'CONSTRAINT', 'approval must remain for large quotes'),
  ]
  const vecs = [
    [1, 0],
    [0.95, 0.31],
    [0, 1],
  ]

  it('surfaces close cross-source pairs the merge judge rejected', () => {
    expect(contradictionCandidates(sigs, vecs, new Set()).map((c) => [c.a.id, c.b.id])).toEqual([
      ['sA:1', 'sB:1'],
    ])
  })

  it('crosses signal types, unlike merging — a METRIC can contradict a CONSTRAINT', () => {
    const v = [
      [1, 0],
      [0, 1],
      [0.97, 0.24],
    ]
    expect(contradictionCandidates(sigs, v, new Set()).map((c) => [c.a.type, c.b.type])).toEqual([
      ['METRIC', 'CONSTRAINT'],
    ])
  })

  it('skips signals that were merged away, which are no longer distinct claims', () => {
    expect(contradictionCandidates(sigs, vecs, new Set(['sB:1']))).toEqual([])
  })

  it('never pairs within one source', () => {
    const same = [sig('sA:1', 'METRIC', 'x'), sig('sA:2', 'METRIC', 'y')]
    expect(contradictionCandidates(same, [[1, 0], [1, 0]], new Set())).toEqual([])
  })

  it('returns the strongest pairs first and caps the list', () => {
    const many = ['a', 'b', 'c', 'd'].map((x) => sig(`s${x}:1`, 'METRIC', x))
    const v = [
      [1, 0],
      [0.99, 0.14],
      [0.9, 0.44],
      [0.8, 0.6],
    ]
    const out = contradictionCandidates(many, v, new Set(), 0.72, 2)
    expect(out).toHaveLength(2)
    expect(out[0].score).toBeGreaterThanOrEqual(out[1].score)
  })
})

describe('scoreConfidence', () => {
  const unit = (id: string, sourceId: string): EvidenceUnit => ({
    id,
    engagementId: 'e',
    sourceId,
    sourceType: 'transcript',
    locator: 'L',
    text: 't',
    charStart: 0,
    charEnd: 1,
    ordinal: 0,
  })
  const corpus = new Corpus([
    unit('E-a-001', 'sA'),
    unit('E-b-001', 'sB'),
    unit('E-c-001', 'sC'),
    unit('E-a-002', 'sA'),
  ])

  it('raises a claim corroborated by three independent sources to HIGH', () => {
    const s = sig('x', 'REQUIREMENT', 'x', ['E-a-001', 'E-b-001', 'E-c-001'])
    expect(scoreConfidence({ ...s, confidence: 'LOW' }, corpus)).toBe('HIGH')
  })

  it('does not count two units from the SAME source as corroboration', () => {
    // Somebody repeating themselves in one meeting is not two sources agreeing.
    const s = sig('x', 'REQUIREMENT', 'x', ['E-a-001', 'E-a-002'])
    expect(scoreConfidence({ ...s, confidence: 'HIGH' }, corpus)).toBe('MEDIUM')
  })

  it('promotes a two-source claim, but only one step from LOW', () => {
    const s = sig('x', 'REQUIREMENT', 'x', ['E-a-001', 'E-b-001'])
    expect(scoreConfidence({ ...s, confidence: 'LOW' }, corpus)).toBe('MEDIUM')
    expect(scoreConfidence({ ...s, confidence: 'MEDIUM' }, corpus)).toBe('HIGH')
  })

  it('caps a single-source claim at MEDIUM however plainly it was stated', () => {
    // HIGH has one meaning: more than one independent source said it. The first
    // version passed the extractor's own judgement through for single-source
    // signals; since extraction runs per source, that rated 181 of 181 signals
    // HIGH on the real corpus. A grading that never discriminates is worse than
    // none, because it looks like information.
    const s = sig('x', 'REQUIREMENT', 'x', ['E-a-001'])
    expect(scoreConfidence({ ...s, confidence: 'HIGH' }, corpus)).toBe('MEDIUM')
  })

  it('leaves a hedged single-source remark at LOW', () => {
    const s = sig('x', 'REQUIREMENT', 'x', ['E-a-001'])
    expect(scoreConfidence({ ...s, confidence: 'MEDIUM' }, corpus)).toBe('LOW')
  })
})

describe('discardReason — the guard on reported contradictions', () => {
  const unit = (id: string, sourceId: string, locator: string, text: string): EvidenceUnit => ({
    id,
    engagementId: 'e',
    sourceId,
    sourceType: 'transcript',
    locator,
    text,
    charStart: 0,
    charEnd: text.length,
    ordinal: 0,
  })

  const corpus = new Corpus([
    unit('E-a-001', 'sA', 'Tom De Vries, msg #4 (03/06/2026 09:02)', 'they want it live before peak season, end of October'),
    unit('E-b-001', 'sB', 'Priya Nair @ 00:05:43', 'realistically we are looking at Q1 next year'),
    unit('E-a-002', 'sA', 'Tom De Vries, msg #9 (03/06/2026 09:14)', 'a quote goes out the same day'),
    unit('E-a-003', 'sA', 'Priya Nair, msg #5 (03/06/2026 09:04)', 'October is peak season. we cannot go live in peak season'),
    unit('E-c-001', 'sC', 'p.4 ¶2', 'the quotation desk comprises 12 staff across 3 branches'),
  ])

  const conflict = (over: Partial<Conflict> = {}): Conflict => ({
    id: 'X1',
    subject: 'Go-live date',
    sideA: {
      claim: 'October',
      evidenceIds: ['E-a-001'],
      quote: 'end of October',
      sourceLabel: 'WhatsApp',
    },
    sideB: {
      claim: 'Q1',
      evidenceIds: ['E-b-001'],
      quote: 'Q1 next year',
      sourceLabel: 'Transcript 2',
    },
    severity: 'BLOCKING',
    whyItMatters: 'Two different projects.',
    resolutionQuestion: 'Which date is committed?',
    ...over,
  })

  it('keeps a genuine cross-source contradiction', () => {
    expect(discardReason(conflict(), corpus)).toBeNull()
  })

  it('discards a side whose quote is not in the evidence it cites', () => {
    // A fabricated contradiction is worse than a missed one: it sends a
    // consultant to the client asking about something nobody said.
    const c = conflict()
    c.sideA.quote = 'they want it live in March'
    expect(discardReason(c, corpus)).toContain('side A')
  })

  it('discards when both sides are the same speaker in the same source', () => {
    // The real case this catches: a stated GOAL measured against current
    // performance. "Quotes should go out same day" against "quotes take two
    // days" is the premise of the engagement, not a conflict.
    const c = conflict({
      subject: 'Quote turnaround',
      sideA: { claim: 'same day', evidenceIds: ['E-a-002'], quote: 'same day', sourceLabel: 'Tom' },
      sideB: { claim: 'October', evidenceIds: ['E-a-001'], quote: 'end of October', sourceLabel: 'Tom' },
    })
    expect(discardReason(c, corpus)).toContain('same speaker')
  })

  it('KEEPS two people disagreeing inside the same source', () => {
    // Tom and Priya arguing in one WhatsApp group is a real contradiction —
    // arguably the most valuable kind, since it is the client disagreeing with
    // itself in writing. A source-level check would have thrown it away.
    const c = conflict({
      sideA: { claim: 'October', evidenceIds: ['E-a-001'], quote: 'end of October', sourceLabel: 'Tom' },
      sideB: {
        claim: 'not in peak season',
        evidenceIds: ['E-a-003'],
        quote: 'we cannot go live in peak season',
        sourceLabel: 'Priya',
      },
    })
    expect(discardReason(c, corpus)).toBeNull()
  })

  it('treats a source with no named speaker, like a PDF, at source level', () => {
    const c = conflict({
      sideA: { claim: '12 staff', evidenceIds: ['E-c-001'], quote: '12 staff across 3 branches', sourceLabel: 'SOP' },
      sideB: { claim: 'same doc', evidenceIds: ['E-c-001'], quote: 'the quotation desk', sourceLabel: 'SOP' },
    })
    expect(discardReason(c, corpus)).toContain('same speaker')
  })

  it('keeps a conflict where one side draws on several sources including the other', () => {
    const c = conflict()
    c.sideB.evidenceIds = ['E-a-001', 'E-b-001']
    c.sideB.quote = 'Q1 next year'
    expect(discardReason(c, corpus)).toBeNull()
  })

  it('reports what it discarded rather than dropping it silently', () => {
    const notes: string[] = []
    const c = conflict()
    c.sideB.quote = 'never said'
    discardReason(c, corpus, (e) => {
      if (e.t === 'note') notes.push(e.text)
    })
    expect(notes[0]).toContain('Go-live date')
  })
})

describe('mapWithConcurrency', () => {
  it('preserves input order regardless of completion order', async () => {
    const r = await mapWithConcurrency([30, 10, 20, 0], 4, async (ms) => {
      await new Promise((res) => setTimeout(res, ms))
      return ms
    })
    expect(r).toEqual([30, 10, 20, 0])
  })

  it('never exceeds the concurrency cap', async () => {
    // Uncapped, a 40-source engagement opens 40 connections and hits a rate
    // limit mid-run, surfacing as a partial brief nobody notices.
    let inFlight = 0
    let peak = 0
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 3, async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight -= 1
      return null
    })
    expect(peak).toBeLessThanOrEqual(3)
  })

  it('handles an empty list', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([])
  })

  it('does not spawn more workers than items', async () => {
    let started = 0
    await mapWithConcurrency([1, 2], 10, async () => {
      started += 1
      return null
    })
    expect(started).toBe(2)
  })
})

describe('pipeline stages', () => {
  it('runs ingest before extract and poc last', () => {
    expect(STAGES.indexOf('ingest')).toBeLessThan(STAGES.indexOf('extract'))
    expect(STAGES.indexOf('extract')).toBeLessThan(STAGES.indexOf('reconcile'))
    expect(STAGES[STAGES.length - 1]).toBe('poc')
  })

  it('gives every stage a human label for the progress UI', () => {
    for (const s of STAGES) expect(STAGE_LABEL[s], s).toBeTruthy()
  })
})
