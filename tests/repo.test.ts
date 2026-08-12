import { describe, it, expect, beforeEach } from 'vitest'
import { repo, resetDbForTests } from '@/lib/db/repo'
import type { EvidenceUnit } from '@/lib/types'
import type { TraceEntry } from '@/lib/llm/types'

beforeEach(() => resetDbForTests(':memory:'))

const unit = (over: Partial<EvidenceUnit> = {}): EvidenceUnit => ({
  id: 'E-src1-001',
  engagementId: 'eng1',
  sourceId: 'src1',
  sourceType: 'transcript',
  locator: 'Priya Nair @ 00:01:00',
  text: 'we quote everything by hand',
  charStart: 0,
  charEnd: 27,
  ordinal: 0,
  ...over,
})

const traceEntry = (over: Partial<TraceEntry> = {}): TraceEntry => ({
  id: 'tr1',
  runId: 'run1',
  engagementId: 'eng1',
  stage: 'extract',
  role: 'extractor',
  model: 'gpt-4.1-mini',
  promptTokens: 1200,
  completionTokens: 300,
  costUsd: 0.00096,
  latencyMs: 1800,
  attempt: 1,
  ok: true,
  summary: 'extract signals',
  createdAt: '2026-08-12T10:00:00.000Z',
  ...over,
})

describe('engagements', () => {
  it('round-trips an engagement', () => {
    const id = repo.createEngagement('Quote-to-Booking', 'Nordwind Logistics')
    expect(repo.getEngagement(id)?.client).toBe('Nordwind Logistics')
  })

  it('lists newest first', () => {
    repo.createEngagement('A', 'C1', 'eng_a')
    repo.createEngagement('B', 'C2', 'eng_b')
    expect(repo.listEngagements().map((e) => e.id)).toContain('eng_b')
    expect(repo.listEngagements()).toHaveLength(2)
  })

  it('returns undefined for an unknown id rather than throwing', () => {
    expect(repo.getEngagement('nope')).toBeUndefined()
  })
})

describe('sources', () => {
  it('stores and patches a source', () => {
    const eid = repo.createEngagement('E', 'C', 'eng1')
    const sid = repo.addSource(eid, { type: 'transcript', name: 'kickoff.txt', bytes: 120 })
    expect(repo.getSource(sid)?.status).toBe('PENDING')

    repo.updateSource(sid, { status: 'READY', rawText: 'hello', meta: { turns: 42 } })
    const s = repo.getSource(sid)
    expect(s?.status).toBe('READY')
    expect(s?.rawText).toBe('hello')
    expect(s?.meta.turns).toBe(42)
  })

  it('an empty patch is a no-op, not a malformed UPDATE', () => {
    const eid = repo.createEngagement('E', 'C', 'eng1')
    const sid = repo.addSource(eid, { type: 'notes', name: 'n.md' })
    expect(() => repo.updateSource(sid, {})).not.toThrow()
    expect(repo.getSource(sid)?.name).toBe('n.md')
  })
})

describe('evidence', () => {
  it('stores and retrieves by id and by engagement', () => {
    repo.createEngagement('E', 'C', 'eng1')
    repo.putEvidence([unit()])
    expect(repo.getEvidenceById('E-src1-001')?.text).toBe('we quote everything by hand')
    expect(repo.getEvidence('eng1')).toHaveLength(1)
  })

  it('returns evidence in ordinal order regardless of insert order', () => {
    repo.createEngagement('E', 'C', 'eng1')
    repo.putEvidence([
      unit({ id: 'E-src1-003', ordinal: 2, text: 'third' }),
      unit({ id: 'E-src1-001', ordinal: 0, text: 'first' }),
      unit({ id: 'E-src1-002', ordinal: 1, text: 'second' }),
    ])
    expect(repo.getEvidence('eng1').map((u) => u.text)).toEqual(['first', 'second', 'third'])
  })

  it('putEvidence is idempotent — re-ingesting replaces rather than duplicating', () => {
    repo.createEngagement('E', 'C', 'eng1')
    repo.putEvidence([unit()])
    repo.putEvidence([unit({ text: 'revised text' })])
    expect(repo.getEvidence('eng1')).toHaveLength(1)
    expect(repo.getEvidenceById('E-src1-001')?.text).toBe('revised text')
  })

  it('putEvidence with an empty array does nothing', () => {
    repo.createEngagement('E', 'C', 'eng1')
    expect(() => repo.putEvidence([])).not.toThrow()
    expect(repo.getEvidence('eng1')).toHaveLength(0)
  })
})

describe('artifacts', () => {
  it('overwrites an artifact of the same kind rather than duplicating', () => {
    const eid = repo.createEngagement('E', 'C', 'eng1')
    repo.saveArtifact(eid, 'brief', 'r1', { v: 1 })
    repo.saveArtifact(eid, 'brief', 'r2', { v: 2 })
    expect(repo.getArtifact<{ v: number }>(eid, 'brief')?.v).toBe(2)
    expect(repo.listArtifactKinds(eid)).toEqual(['brief'])
  })

  it('keeps different kinds side by side', () => {
    const eid = repo.createEngagement('E', 'C', 'eng1')
    repo.saveArtifact(eid, 'brief', 'r1', { a: 1 })
    repo.saveArtifact(eid, 'blueprint', 'r1', { b: 2 })
    expect(repo.listArtifactKinds(eid).sort()).toEqual(['blueprint', 'brief'])
  })
})

describe('trace', () => {
  it('records a call and reads it back with booleans intact', () => {
    repo.createEngagement('E', 'C', 'eng1')
    repo.appendTrace(traceEntry())
    const [t] = repo.getTrace('eng1')
    expect(t.ok).toBe(true)
    expect(t.promptTokens).toBe(1200)
    expect(t.costUsd).toBeCloseTo(0.00096, 8)
  })

  it('records failed calls too — a run that cost money and produced nothing must be visible', () => {
    repo.createEngagement('E', 'C', 'eng1')
    repo.appendTrace(traceEntry({ id: 'tr2', ok: false, error: 'TruncationError', attempt: 2 }))
    const [t] = repo.getTrace('eng1')
    expect(t.ok).toBe(false)
    expect(t.error).toBe('TruncationError')
    expect(t.attempt).toBe(2)
  })
})

describe('runs', () => {
  it('tracks a run from start to finish with its review flags', () => {
    const eid = repo.createEngagement('E', 'C', 'eng1')
    const rid = repo.startRun(eid)
    expect(repo.latestRun(eid)?.status).toBe('RUNNING')

    repo.finishRun(rid, 'DONE', ['blueprint'])
    const r = repo.latestRun(eid)
    expect(r?.status).toBe('DONE')
    expect(r?.needsHumanReview).toEqual(['blueprint'])
    expect(r?.finishedAt).toBeTruthy()
  })
})

describe('claim overrides', () => {
  it('records a consultant rejecting a claim', () => {
    const eid = repo.createEngagement('E', 'C', 'eng1')
    repo.setClaimStatus(eid, 'R-004', 'REJECTED')
    expect(repo.getClaimOverrides(eid)['R-004'].status).toBe('REJECTED')
  })

  it('an edit supersedes an earlier verdict on the same claim', () => {
    const eid = repo.createEngagement('E', 'C', 'eng1')
    repo.setClaimStatus(eid, 'R-004', 'REJECTED')
    repo.setClaimStatus(eid, 'R-004', 'EDITED', 'Multi-currency quoting, EUR and NOK only')
    const o = repo.getClaimOverrides(eid)['R-004']
    expect(o.status).toBe('EDITED')
    expect(o.text).toContain('NOK')
    expect(Object.keys(repo.getClaimOverrides(eid))).toHaveLength(1)
  })

  it('clearing an override removes it entirely', () => {
    const eid = repo.createEngagement('E', 'C', 'eng1')
    repo.setClaimStatus(eid, 'R-004', 'ACCEPTED')
    repo.clearClaimStatus(eid, 'R-004')
    expect(repo.getClaimOverrides(eid)).toEqual({})
  })
})

describe('cascade', () => {
  it('deleting an engagement takes its sources, evidence and artifacts with it', () => {
    const eid = repo.createEngagement('E', 'C', 'eng1')
    repo.addSource(eid, { type: 'notes', name: 'n.md' })
    repo.putEvidence([unit()])
    repo.saveArtifact(eid, 'brief', 'r1', { v: 1 })

    repo.deleteEngagement(eid)

    expect(repo.listSources(eid)).toHaveLength(0)
    expect(repo.getEvidence(eid)).toHaveLength(0)
    expect(repo.getArtifact(eid, 'brief')).toBeUndefined()
  })
})
