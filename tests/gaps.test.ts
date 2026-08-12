import { describe, it, expect } from 'vitest'
import { coverageScore, coverageByDimension, clientQuestionList } from '@/lib/pipeline/gaps'
import { toMermaid, traceabilityMatrix, asIsDiagram } from '@/lib/pipeline/blueprint'
import type { GapRow } from '@/lib/schema/gaps'
import type { Blueprint } from '@/lib/schema/blueprint'
import type { Brief } from '@/lib/schema/brief'

const row = (over: Partial<GapRow> & Pick<GapRow, 'questionId' | 'status'>): GapRow => ({
  dimension: 'Compliance',
  question: 'Where must data be stored?',
  whyItMatters: 'Decides hosting region.',
  evidenceSummary: '',
  evidenceIds: [],
  clientQuestion: over.status === 'COVERED' ? null : 'Which jurisdiction must hold the data?',
  ...over,
})

describe('coverageScore', () => {
  it('scores PARTIAL as half a point', () => {
    const g = [
      row({ questionId: 'A', status: 'COVERED' }),
      row({ questionId: 'B', status: 'PARTIAL' }),
      row({ questionId: 'C', status: 'MISSING' }),
      row({ questionId: 'D', status: 'MISSING' }),
    ]
    expect(coverageScore(g)).toEqual({ covered: 1, partial: 1, missing: 2, pct: 38 })
  })

  it('is 100 when everything is covered', () => {
    expect(coverageScore([row({ questionId: 'A', status: 'COVERED' })]).pct).toBe(100)
  })

  it('is 0 when nothing is', () => {
    expect(coverageScore([row({ questionId: 'A', status: 'MISSING' })]).pct).toBe(0)
  })

  it('does not divide by zero on an empty checklist', () => {
    expect(coverageScore([]).pct).toBe(0)
  })
})

describe('coverageByDimension', () => {
  it('scores each dimension independently', () => {
    const g = [
      row({ questionId: 'A', status: 'COVERED', dimension: 'Data' }),
      row({ questionId: 'B', status: 'MISSING', dimension: 'Data' }),
      row({ questionId: 'C', status: 'MISSING', dimension: 'Compliance' }),
    ]
    const d = coverageByDimension(g)
    expect(d.find((x) => x.dimension === 'Data')).toEqual({ dimension: 'Data', pct: 50, missing: 1 })
    expect(d.find((x) => x.dimension === 'Compliance')?.pct).toBe(0)
  })
})

describe('clientQuestionList', () => {
  const g = [
    row({ questionId: 'A', status: 'COVERED' }),
    row({ questionId: 'B', status: 'PARTIAL', clientQuestion: 'partial one' }),
    row({ questionId: 'C', status: 'MISSING', clientQuestion: 'missing one' }),
  ]

  it('omits covered items and numbers the rest', () => {
    const out = clientQuestionList(g)
    expect(out).toContain('1. [Compliance] missing one')
    expect(out).toContain('2. [Compliance] partial one')
  })

  it('puts MISSING before PARTIAL, worst first', () => {
    const out = clientQuestionList(g)
    expect(out.indexOf('missing one')).toBeLessThan(out.indexOf('partial one'))
  })

  it('is empty when the pack answers everything', () => {
    expect(clientQuestionList([row({ questionId: 'A', status: 'COVERED' })])).toBe('')
  })
})

describe('toMermaid', () => {
  it('emits a flowchart with one node per step, wired in order', () => {
    const m = toMermaid(
      [
        { step: 1, name: 'Receive enquiry', actor: 'Desk' },
        { step: 2, name: 'Price it', actor: 'Desk' },
      ],
      'As-is',
    )
    expect(m).toContain('flowchart TD')
    expect(m).toContain('S1["Receive enquiry<br/>Desk"]')
    expect(m).toContain('S1 --> S2')
  })

  it('escapes quotes and brackets that would otherwise break the diagram', () => {
    // A client's own step name — Receive "RFQ" [urgent] — is enough to take out
    // the whole render if it goes through unescaped.
    const m = toMermaid([{ step: 1, name: 'Receive "RFQ" [urgent]' }], 'As-is')
    expect(m).toContain('#quot;RFQ#quot;')
    expect(m).not.toMatch(/\[urgent\]/)
  })

  it('sorts by step number regardless of input order', () => {
    const m = toMermaid([{ step: 3, name: 'C' }, { step: 1, name: 'A' }, { step: 2, name: 'B' }], 'x')
    expect(m.indexOf('S1["A"]')).toBeLessThan(m.indexOf('S2["B"]'))
    expect(m).toContain('S1 --> S2')
    expect(m).toContain('S2 --> S3')
  })

  it('distinguishes disposition by SHAPE as well as colour', () => {
    // Colour alone fails WCAG and fails anyone printing the diagram.
    const auto = toMermaid([{ step: 1, name: 'X', disposition: 'AUTOMATE' }], 't')
    const elim = toMermaid([{ step: 1, name: 'X', disposition: 'ELIMINATE' }], 't')
    const keep = toMermaid([{ step: 1, name: 'X', disposition: 'KEEP' }], 't')
    expect(auto).toContain('S1[["X"]]')
    expect(elim).toContain('S1[/"X"\\]')
    expect(keep).toContain('S1["X"]')
    expect(auto).toContain('class S1 automate')
  })

  it('marks an as-is bottleneck when no disposition applies', () => {
    expect(toMermaid([{ step: 1, name: 'Approval', isBottleneck: true }], 't')).toContain('class S1 bottleneck')
  })

  it('renders something rather than nothing for an empty process', () => {
    expect(toMermaid([], 't')).toContain('No steps recorded')
  })

  it('handles a single-step process without emitting a dangling edge', () => {
    expect(toMermaid([{ step: 1, name: 'Only' }], 't')).not.toContain('-->')
  })
})

describe('traceabilityMatrix', () => {
  const brief = {
    requirements: [
      { id: 'R1', statement: 'a', moscow: 'MUST', rationale: '', confidence: 'HIGH', citation: { evidenceIds: ['E'], quote: 'x' } },
      { id: 'R2', statement: 'b', moscow: 'SHOULD', rationale: '', confidence: 'HIGH', citation: { evidenceIds: ['E'], quote: 'x' } },
    ],
  } as unknown as Brief

  const bp = {
    features: [{ id: 'F1', name: 'x', description: 'y', requirementIds: ['R1'], priority: 'P0', effort: 'M' }],
  } as unknown as Blueprint

  it('reports which feature covers which requirement', () => {
    const m = traceabilityMatrix(bp, brief)
    expect(m.covers('F1', 'R1')).toBe(true)
    expect(m.covers('F1', 'R2')).toBe(false)
  })

  it('names requirements no feature delivers — a visible gap beats an invisible one', () => {
    expect(traceabilityMatrix(bp, brief).uncovered).toEqual(['R2'])
  })

  it('reports nothing uncovered when every requirement is mapped', () => {
    const full = { features: [{ ...bp.features[0], requirementIds: ['R1', 'R2'] }] } as unknown as Blueprint
    expect(traceabilityMatrix(full, brief).uncovered).toEqual([])
  })
})

describe('asIsDiagram', () => {
  it('renders the brief current process, marking bottlenecks', () => {
    const brief = {
      currentProcess: [
        { step: 1, name: 'Price by hand', actor: 'Desk', detail: '', isBottleneck: true, citation: { evidenceIds: ['E'], quote: 'x' } },
        { step: 2, name: 'Approve', actor: 'Marta', detail: '', isBottleneck: false, citation: { evidenceIds: ['E'], quote: 'x' } },
      ],
    } as unknown as Brief
    const m = asIsDiagram(brief)
    expect(m).toContain('S1["Price by hand<br/>Desk"]')
    expect(m).toContain('class S1 bottleneck')
    expect(m).toContain('class S2 keep')
  })
})
