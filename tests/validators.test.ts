import { describe, it, expect } from 'vitest'
import { Corpus } from '@/lib/evidence'
import type { EvidenceUnit } from '@/lib/types'
import type { Brief } from '@/lib/schema/brief'
import type { Blueprint } from '@/lib/schema/blueprint'
import type { AppSpec } from '@/lib/schema/appspec'
import type { Conflict } from '@/lib/schema/signals'
import {
  validateBrief,
  validateBlueprint,
  validateAppSpec,
  validateSignals,
  toFeedback,
  runLoop,
  type Violation,
} from '@/lib/verify'

// ---------------------------------------------------------------------------
// Fixtures: a small corpus and outputs that are correct against it.
// ---------------------------------------------------------------------------

const u = (id: string, text: string, locator = 'Priya @ 00:01:00'): EvidenceUnit => ({
  id,
  engagementId: 'eng1',
  sourceId: 's1',
  sourceType: 'transcript',
  locator,
  text,
  charStart: 0,
  charEnd: text.length,
  ordinal: 0,
})

const corpus = new Corpus([
  u('E-s1-001', 'We quote everything by hand, in Excel, and it takes about two days.'),
  u('E-s1-002', 'The quotation desk is twelve people across three branches.'),
  u('E-s1-003', 'We lose deals because we are slow to come back with a price.'),
  u('E-s1-004', 'Everything goes through Marta before it leaves the building.'),
])

const cite = (ids: string[], quote: string) => ({ evidenceIds: ids, quote })

const goodBrief = (): Brief => ({
  executiveSummary:
    'Nordwind quotes freight by hand in Excel, taking around two days per quote across a twelve-person desk. The delay is costing them deals. A structured quoting workflow would remove the manual re-keying and the single approval bottleneck.',
  goal: {
    statement: 'Cut the time to return a freight quote from two days to same-day.',
    citation: cite(['E-s1-001'], 'We quote everything by hand, in Excel, and it takes about two days.'),
  },
  currentProcess: [
    {
      step: 1,
      name: 'Price the enquiry by hand',
      actor: 'Quotation desk',
      detail: 'Rates are looked up and assembled in a spreadsheet.',
      isBottleneck: true,
      citation: cite(['E-s1-001'], 'We quote everything by hand, in Excel'),
    },
    {
      step: 2,
      name: 'Approval',
      actor: 'Marta',
      detail: 'Every quote is checked before it is sent.',
      isBottleneck: true,
      citation: cite(['E-s1-004'], 'Everything goes through Marta before it leaves the building.'),
    },
  ],
  painPoints: [
    {
      id: 'P1',
      statement: 'Quotes take about two days, which loses deals.',
      impact: 'HIGH',
      affects: 'Sales and the quotation desk',
      confidence: 'HIGH',
      citation: cite(['E-s1-003'], 'We lose deals because we are slow to come back with a price.'),
    },
    {
      id: 'P2',
      statement: 'A single approver is a bottleneck.',
      impact: 'MEDIUM',
      affects: 'Quotation desk',
      confidence: 'MEDIUM',
      citation: cite(['E-s1-004'], 'Everything goes through Marta'),
    },
  ],
  requirements: [
    {
      id: 'R1',
      statement: 'Assemble a quote from stored rates rather than by hand.',
      moscow: 'MUST',
      rationale: 'Removes the two-day manual step.',
      confidence: 'HIGH',
      citation: cite(['E-s1-001'], 'We quote everything by hand, in Excel'),
    },
    {
      id: 'R2',
      statement: 'Support twelve concurrent desk users across three branches.',
      moscow: 'MUST',
      rationale: 'Matches the stated desk size.',
      confidence: 'HIGH',
      citation: cite(['E-s1-002'], 'The quotation desk is twelve people across three branches.'),
    },
  ],
  constraints: [
    {
      id: 'C1',
      statement: 'Approval by Marta must remain possible for high-value quotes.',
      citation: cite(['E-s1-004'], 'Everything goes through Marta before it leaves the building.'),
    },
  ],
  stakeholders: [
    { name: 'Marta', role: 'Approver', citation: cite(['E-s1-004'], 'Everything goes through Marta') },
  ],
  systems: [{ name: 'Excel', role: 'Current quoting tool', citation: cite(['E-s1-001'], 'in Excel') }],
  openQuestions: [],
})

const goodBlueprint = (): Blueprint => ({
  summary:
    'Replace the spreadsheet with a rate-driven quote builder, and replace blanket approval with a value threshold so most quotes go straight out.',
  toBeProcess: [
    {
      step: 1,
      name: 'Assemble quote from stored rates',
      actor: 'Quotation desk',
      disposition: 'AUTOMATE',
      rationale: 'Rate lookup and arithmetic need no human judgement.',
      resolvesPainIds: ['P1'],
      replacesAsIsStep: 1,
    },
    {
      step: 2,
      name: 'Approve only above threshold',
      actor: 'Marta',
      disposition: 'SIMPLIFY',
      rationale: 'Judgement is still needed on large quotes, not on every quote.',
      resolvesPainIds: ['P2'],
      replacesAsIsStep: 2,
    },
  ],
  features: [
    {
      id: 'F1',
      name: 'Rate-driven quote builder',
      description: 'Builds a priced quote from the stored rate card.',
      requirementIds: ['R1'],
      priority: 'P0',
      effort: 'M',
    },
    {
      id: 'F2',
      name: 'Multi-branch desk queue',
      description: 'Shared queue visible across the three branches.',
      requirementIds: ['R2'],
      priority: 'P1',
      effort: 'S',
    },
  ],
  roles: [
    { id: 'RO1', name: 'Quotation Desk', responsibilities: 'Prices and issues quotes.' },
    { id: 'RO2', name: 'Approver', responsibilities: 'Approves quotes above the threshold.' },
  ],
  screens: [
    { id: 'SC1', name: 'Quote queue', purpose: 'See what needs pricing.', roleIds: ['RO1'], featureIds: ['F2'] },
    { id: 'SC2', name: 'Quote builder', purpose: 'Build and send a quote.', roleIds: ['RO1'], featureIds: ['F1'] },
  ],
  flow: [{ fromScreenId: 'SC1', toScreenId: 'SC2', trigger: 'Open an enquiry' }],
  outOfScope: [{ item: 'Customer self-service portal', reason: 'No evidence customers asked for it.' }],
})

const goodAppSpec = (): AppSpec => ({
  appName: 'Nordwind Quote Desk',
  tagline: 'One queue, one quote, no spreadsheets',
  roles: [
    { id: 'RO1', name: 'Quotation Desk' },
    { id: 'RO2', name: 'Approver' },
  ],
  screens: [
    {
      id: 'SC1',
      name: 'Quote queue',
      icon: 'inbox',
      roleIds: ['RO1'],
      blocks: [
        {
          kind: 'table',
          title: 'Open enquiries',
          columns: ['Ref', 'Customer', 'Status'],
          rows: [['RFQ-1041', 'Bergen Seafood', 'Pricing']],
          statusColumn: 2,
          rowActionLabel: 'Open',
          rowActionTarget: 'SC2',
        },
      ],
    },
    {
      id: 'SC2',
      name: 'Quote builder',
      icon: 'file',
      roleIds: ['RO1'],
      blocks: [
        {
          kind: 'detail',
          title: 'RFQ-1041',
          fields: [
            { label: 'Customer', value: 'Bergen Seafood' },
            { label: 'Lane', value: 'Bergen to Rotterdam' },
          ],
          actions: [{ label: 'Send quote', target: 'SC1' }],
        },
      ],
    },
  ],
})

const codes = (vs: Violation[]) => vs.map((v) => v.code)

// ---------------------------------------------------------------------------

describe('validateBrief — the grounded case', () => {
  it('passes a fully grounded brief with no violations at all', () => {
    expect(validateBrief(goodBrief(), corpus)).toEqual([])
  })
})

describe('validateBrief — HALLUCINATED_EVIDENCE', () => {
  it('flags a cited id that is not in the corpus', () => {
    const b = goodBrief()
    b.goal.citation.evidenceIds = ['E-s9-042']
    expect(codes(validateBrief(b, corpus))).toContain('HALLUCINATED_EVIDENCE')
  })

  it('names the offending id so the retry instruction is actionable', () => {
    const b = goodBrief()
    b.requirements[0].citation.evidenceIds = ['E-ghost-001']
    const found = validateBrief(b, corpus).find((v) => v.code === 'HALLUCINATED_EVIDENCE')
    expect(found?.detail).toContain('E-ghost-001')
    expect(found?.claimId).toBe('R1')
  })

  it('still flags when only one of several cited ids is fabricated', () => {
    const b = goodBrief()
    b.requirements[0].citation.evidenceIds = ['E-s1-001', 'E-ghost-001']
    expect(codes(validateBrief(b, corpus))).toContain('HALLUCINATED_EVIDENCE')
  })
})

describe('validateBrief — QUOTE_MISMATCH', () => {
  it('flags a quote that is not in the cited evidence', () => {
    const b = goodBrief()
    b.goal.citation.quote = 'We already use SAP for everything.'
    expect(codes(validateBrief(b, corpus))).toContain('QUOTE_MISMATCH')
  })

  it('flags a quote that mixes real words into a claim never made', () => {
    // The dangerous case: it looks verbatim, cites a real unit, and is false.
    const b = goodBrief()
    b.requirements[1].citation.quote = 'The quotation desk is forty people across three branches.'
    expect(codes(validateBrief(b, corpus))).toContain('QUOTE_MISMATCH')
  })

  it('shows what the cited evidence actually says, so the model can correct itself', () => {
    const b = goodBrief()
    b.goal.citation.quote = 'nonsense that was never said'
    const found = validateBrief(b, corpus).find((v) => v.code === 'QUOTE_MISMATCH')
    expect(found?.detail).toContain('We quote everything by hand')
    expect(found?.detail).toContain('no other evidence unit does either')
  })

  it('names the unit the quote REALLY came from when the words are just misattributed', () => {
    // The commonest form of this violation is not fabrication: the model quoted
    // something real and attached the wrong id. Naming the right one turns a
    // dead end into a one-line correction; saying only "wrong" invites it to
    // invent a different quote instead.
    const b = goodBrief()
    b.goal.citation.evidenceIds = ['E-s1-001']
    b.goal.citation.quote = 'Everything goes through Marta before it leaves the building.'
    const found = validateBrief(b, corpus).find((v) => v.code === 'QUOTE_MISMATCH')
    expect(found?.detail).toContain('belongs to E-s1-004')
    expect(found?.detail).toContain('Change the cited evidence id to E-s1-004')
  })

  it('accepts a faithful partial quote', () => {
    const b = goodBrief()
    b.goal.citation.quote = 'takes about two days'
    expect(validateBrief(b, corpus)).toEqual([])
  })
})

describe('validateBrief — UNGROUNDED_CLAIM', () => {
  it('flags a claim with an empty citation list', () => {
    const b = goodBrief()
    b.requirements[0].citation.evidenceIds = []
    expect(codes(validateBrief(b, corpus))).toContain('UNGROUNDED_CLAIM')
  })
})

describe('validateBrief — PLACEHOLDER', () => {
  it.each(['TBD', 'TODO: fill this in', 'lorem ipsum dolor', 'Reduce time by [...]'])(
    'flags %s',
    (text) => {
      const b = goodBrief()
      b.requirements[0].statement = text
      expect(codes(validateBrief(b, corpus))).toContain('PLACEHOLDER')
    },
  )

  it('flags placeholder text in the executive summary', () => {
    const b = goodBrief()
    b.executiveSummary = 'TODO: write the summary once we have the numbers.'
    expect(codes(validateBrief(b, corpus))).toContain('PLACEHOLDER')
  })

  it('does not flag ordinary prose containing the letters tbd inside a word', () => {
    const b = goodBrief()
    b.requirements[0].statement = 'Support the Rotterdam and Bergen lanes.'
    expect(codes(validateBrief(b, corpus))).not.toContain('PLACEHOLDER')
  })
})

describe('validateBrief — EMPTY_SECTION and DUPLICATE_ID', () => {
  it('flags a brief with no requirements as an error', () => {
    const b = goodBrief()
    b.requirements = []
    const found = validateBrief(b, corpus).find((v) => v.code === 'EMPTY_SECTION')
    expect(found?.severity).toBe('ERROR')
  })

  it('flags no pain points as a warning, not an error', () => {
    const b = goodBrief()
    b.painPoints = []
    const found = validateBrief(b, corpus).find((v) => v.claimId === 'painPoints')
    expect(found?.severity).toBe('WARN')
  })

  it('flags a requirement id used twice, which makes cross-references ambiguous', () => {
    const b = goodBrief()
    b.requirements[1].id = 'R1'
    expect(codes(validateBrief(b, corpus))).toContain('DUPLICATE_ID')
  })
})

describe('validateBrief — UNRESOLVED_CONFLICT', () => {
  const conflict: Conflict = {
    id: 'X1',
    subject: 'Go-live timeline',
    sideA: { claim: 'End of October', evidenceIds: ['E-s1-001'], quote: 'by hand', sourceLabel: 'WhatsApp' },
    sideB: { claim: 'Q1 next year', evidenceIds: ['E-s1-002'], quote: 'twelve people', sourceLabel: 'Transcript 2' },
    severity: 'BLOCKING',
    whyItMatters: 'Two different projects.',
    resolutionQuestion: 'Which date is committed?',
  }

  it('flags a contradiction the brief noticed but asked nothing about', () => {
    // Worse than missing it: it looks handled.
    expect(codes(validateBrief(goodBrief(), corpus, [conflict]))).toContain('UNRESOLVED_CONFLICT')
  })

  it('passes when an open question is linked to the conflict', () => {
    const b = goodBrief()
    b.openQuestions = [
      { id: 'Q1', question: 'Which go-live date is committed?', why: 'Sources disagree.', raisedByConflictId: 'X1' },
    ]
    expect(validateBrief(b, corpus, [conflict])).toEqual([])
  })

  it('treats a MINOR conflict as a warning rather than blocking a retry', () => {
    const minor = { ...conflict, severity: 'MINOR' as const }
    const found = validateBrief(goodBrief(), corpus, [minor]).find((v) => v.code === 'UNRESOLVED_CONFLICT')
    expect(found?.severity).toBe('WARN')
  })
})

describe('validateBlueprint', () => {
  it('passes a blueprint that traces cleanly to its brief', () => {
    expect(validateBlueprint(goodBlueprint(), goodBrief())).toEqual([])
  })

  it('flags ORPHAN_FEATURE when a feature traces to no real requirement', () => {
    const bp = goodBlueprint()
    bp.features[0].requirementIds = ['R-nope']
    const found = validateBlueprint(bp, goodBrief()).find((v) => v.code === 'ORPHAN_FEATURE')
    expect(found?.severity).toBe('ERROR')
    expect(found?.detail).toContain('invented scope')
  })

  it('flags a partly-wrong mapping as a warning, since one real requirement remains', () => {
    const bp = goodBlueprint()
    bp.features[0].requirementIds = ['R1', 'R-nope']
    const vs = validateBlueprint(bp, goodBrief())
    expect(codes(vs)).toContain('DANGLING_REFERENCE')
    expect(codes(vs)).not.toContain('ORPHAN_FEATURE')
  })

  it('flags UNADDRESSED_PAIN as an error when the pain is HIGH impact', () => {
    const bp = goodBlueprint()
    bp.toBeProcess[0].resolvesPainIds = []
    const found = validateBlueprint(bp, goodBrief()).find((v) => v.code === 'UNADDRESSED_PAIN')
    expect(found?.claimId).toBe('P1')
    expect(found?.severity).toBe('ERROR')
  })

  it('flags UNADDRESSED_PAIN as a warning when the pain is only MEDIUM', () => {
    const bp = goodBlueprint()
    bp.toBeProcess[1].resolvesPainIds = []
    const found = validateBlueprint(bp, goodBrief()).find((v) => v.claimId === 'P2')
    expect(found?.severity).toBe('WARN')
  })

  it('flags a to-be step claiming to resolve a pain point that does not exist', () => {
    const bp = goodBlueprint()
    bp.toBeProcess[0].resolvesPainIds = ['P1', 'P99']
    expect(codes(validateBlueprint(bp, goodBrief()))).toContain('DANGLING_REFERENCE')
  })

  it('flags ROLE_UNDEFINED when a screen is assigned to an unknown role', () => {
    const bp = goodBlueprint()
    bp.screens[0].roleIds = ['RO9']
    expect(codes(validateBlueprint(bp, goodBrief()))).toContain('ROLE_UNDEFINED')
  })

  it('flags a flow edge pointing at a screen that does not exist', () => {
    const bp = goodBlueprint()
    bp.flow[0].toScreenId = 'SC9'
    const found = validateBlueprint(bp, goodBrief()).find((v) => v.code === 'DANGLING_REFERENCE')
    expect(found?.detail).toContain('SC9')
  })

  it('flags a duplicated feature id', () => {
    const bp = goodBlueprint()
    bp.features[1].id = 'F1'
    expect(codes(validateBlueprint(bp, goodBrief()))).toContain('DUPLICATE_ID')
  })
})

describe('validateAppSpec', () => {
  it('passes a spec whose navigation all resolves', () => {
    expect(validateAppSpec(goodAppSpec(), goodBlueprint())).toEqual([])
  })

  it('flags a row action pointing at a screen that does not exist', () => {
    const s = goodAppSpec()
    const block = s.screens[0].blocks[0]
    if (block.kind === 'table') block.rowActionTarget = 'SC9'
    const found = validateAppSpec(s, goodBlueprint()).find((v) => v.code === 'DANGLING_REFERENCE')
    expect(found?.detail).toContain('would do nothing')
  })

  it('flags a screen visible to a role not in the roles list', () => {
    const s = goodAppSpec()
    s.screens[0].roleIds = ['RO9']
    const found = validateAppSpec(s, goodBlueprint()).find((v) => v.code === 'ROLE_UNDEFINED')
    expect(found?.detail).toContain('role switcher')
  })

  it('flags a ragged table, which would render misaligned', () => {
    const s = goodAppSpec()
    const block = s.screens[0].blocks[0]
    if (block.kind === 'table') block.rows.push(['RFQ-1042', 'Only two cells'])
    expect(codes(validateAppSpec(s, goodBlueprint()))).toContain('DANGLING_REFERENCE')
  })

  it('flags a status column index outside the table', () => {
    const s = goodAppSpec()
    const block = s.screens[0].blocks[0]
    if (block.kind === 'table') block.statusColumn = 7
    const found = validateAppSpec(s, goodBlueprint()).find((v) => v.detail.includes('status column'))
    expect(found?.severity).toBe('WARN')
  })

  it('flags placeholder seed data — a POC must use the client vocabulary', () => {
    const s = goodAppSpec()
    const block = s.screens[0].blocks[0]
    if (block.kind === 'table') block.rows = [['RFQ-0001', 'Lorem Ipsum GmbH', 'Pricing']]
    const found = validateAppSpec(s, goodBlueprint()).find((v) => v.code === 'PLACEHOLDER')
    expect(found?.detail).toContain('Lorem Ipsum GmbH')
  })

  it('does NOT flag a form whose schema has a field named "placeholder"', () => {
    // This cost real retries. The check tested JSON.stringify(screen), which
    // includes KEY names, and the form block has a field literally called
    // `placeholder` — so every screen containing a form was rejected as
    // unfinished work.
    const s = goodAppSpec()
    s.screens[1].blocks = [
      {
        kind: 'form',
        title: 'New enquiry',
        submitLabel: 'Create quote',
        submitTarget: 'SC1',
        fields: [
          { label: 'Customer', type: 'text', options: [], placeholder: 'Bergen Seafood AS', required: true },
          { label: 'Lane', type: 'select', options: ['Bergen to Rotterdam'], placeholder: 'Choose a lane', required: true },
        ],
      },
    ]
    expect(codes(validateAppSpec(s, goodBlueprint()))).not.toContain('PLACEHOLDER')
  })

  it('still catches lorem text inside a form field label', () => {
    const s = goodAppSpec()
    s.screens[1].blocks = [
      {
        kind: 'form',
        title: 'Lorem ipsum form',
        submitLabel: 'Go',
        submitTarget: 'SC1',
        fields: [{ label: 'Customer', type: 'text', options: [], placeholder: 'name', required: true }],
      },
    ]
    expect(codes(validateAppSpec(s, goodBlueprint()))).toContain('PLACEHOLDER')
  })

  it('flags a multi-screen spec where nothing navigates anywhere', () => {
    const s = goodAppSpec()
    const t = s.screens[0].blocks[0]
    if (t.kind === 'table') t.rowActionTarget = null
    const d = s.screens[1].blocks[0]
    if (d.kind === 'detail') d.actions = [{ label: 'Send quote', target: null }]
    const found = validateAppSpec(s, goodBlueprint()).find((v) => v.claimId === 'flow')
    expect(found?.detail).toContain('cannot be clicked through')
  })

  it('warns when the POC invents a role the blueprint never identified', () => {
    const s = goodAppSpec()
    s.roles.push({ id: 'RO3', name: 'Regional Director' })
    const found = validateAppSpec(s, goodBlueprint()).find((v) => v.claimId === 'RO3')
    expect(found?.severity).toBe('WARN')
  })
})

describe('validateSignals', () => {
  it('passes grounded signals', () => {
    expect(
      validateSignals(
        [
          {
            id: 'S1',
            type: 'PAIN_POINT',
            statement: 'Quoting takes two days',
            detail: '',
            subject: 'quote turnaround',
            confidence: 'HIGH',
            citation: cite(['E-s1-001'], 'takes about two days'),
          },
        ],
        corpus,
      ),
    ).toEqual([])
  })

  it('flags a fabricated citation at extraction time, before it can reach the brief', () => {
    expect(
      codes(
        validateSignals(
          [
            {
              id: 'S1',
              type: 'REQUIREMENT',
              statement: 'Must integrate with SAP',
              detail: '',
              subject: 'integration',
              confidence: 'HIGH',
              citation: cite(['E-s1-001'], 'we use SAP'),
            },
          ],
          corpus,
        ),
      ),
    ).toContain('QUOTE_MISMATCH')
  })
})

describe('toFeedback', () => {
  const vs: Violation[] = [
    { code: 'HALLUCINATED_EVIDENCE', claimId: 'R1', detail: 'R1 cites E-x-001 which does not exist.', severity: 'ERROR' },
    { code: 'UNADDRESSED_PAIN', claimId: 'P3', detail: 'P3 is not resolved.', severity: 'WARN' },
  ]

  it('tells the model to change nothing else — otherwise it rewrites everything', () => {
    expect(toFeedback(vs, 1)).toContain('change nothing else')
  })

  it('numbers the blocking problems and separates the advisory ones', () => {
    const f = toFeedback(vs, 2)
    expect(f).toContain('Attempt 2 was rejected')
    expect(f).toContain('1. [HALLUCINATED_EVIDENCE]')
    expect(f).toContain('Also worth addressing')
  })
})

// ---------------------------------------------------------------------------

describe('runLoop', () => {
  const fail = (detail = 'nothing here'): Violation[] => [
    { code: 'EMPTY_SECTION', claimId: 'x', detail, severity: 'ERROR' },
  ]

  it('succeeds first time when validation is clean', async () => {
    const r = await runLoop<number>({
      stage: 't',
      maxAttempts: 3,
      generate: async () => 1,
      validate: () => [],
    })
    expect(r.attempts).toBe(1)
    expect(r.needsHumanReview).toBe(false)
  })

  it('feeds the failure back as the instruction and succeeds on attempt 2', async () => {
    const seen: (string | null)[] = []
    const r = await runLoop<{ ok: boolean }>({
      stage: 't',
      maxAttempts: 3,
      generate: async (fb, n) => {
        seen.push(fb)
        return { ok: n > 1 }
      },
      validate: (v) => (v.ok ? [] : fail('the goal section is empty')),
    })
    expect(r.attempts).toBe(2)
    expect(r.needsHumanReview).toBe(false)
    expect(seen[0]).toBeNull()
    expect(seen[1]).toContain('the goal section is empty')
  })

  it('abandons after maxAttempts and flags for review rather than shipping silently', async () => {
    const r = await runLoop<{ ok: boolean }>({
      stage: 't',
      maxAttempts: 3,
      generate: async () => ({ ok: false }),
      validate: () => fail(),
    })
    expect(r.attempts).toBe(3)
    expect(r.needsHumanReview).toBe(true)
    expect(r.violations).toHaveLength(1)
  })

  it('does not retry on WARN-severity violations alone', async () => {
    let calls = 0
    const r = await runLoop({
      stage: 't',
      maxAttempts: 3,
      generate: async () => {
        calls += 1
        return { v: calls }
      },
      validate: () => [{ code: 'PLACEHOLDER' as const, claimId: 'x', detail: 'd', severity: 'WARN' as const }],
    })
    expect(calls).toBe(1)
    expect(r.needsHumanReview).toBe(false)
    expect(r.violations).toHaveLength(1)
  })

  it('returns the BEST attempt on abandonment, not the last', async () => {
    // A model told to fix three things will sometimes fix two and break a
    // fourth. Returning the last attempt would silently ship that regression.
    const byAttempt: Record<number, Violation[]> = {
      1: fail('a'),
      2: [],
      3: [...fail('a'), ...fail('b')],
    }
    // Attempt 2 is clean on Tier 1 but the critic rejects everything, so the
    // loop keeps going and ends on the worst attempt.
    const r = await runLoop<number>({
      stage: 't',
      maxAttempts: 3,
      generate: async (_fb, n) => n,
      validate: (n) => byAttempt[n] ?? [],
      critique: async () => ({
        reasoning: 'The evidence does not support this at all, on any attempt.',
        issues: [{ claimId: 'x', problem: 'unsupported', fix: 'cite something real' }],
        verdict: 'FAIL',
      }),
    })
    expect(r.value).toBe(2)
    expect(r.needsHumanReview).toBe(true)
  })

  it('skips the critic entirely when Tier 1 already failed', async () => {
    // No sense paying a model to opine on whether a claim is right when we
    // already know its citation points at nothing.
    let critiques = 0
    await runLoop<number>({
      stage: 't',
      maxAttempts: 2,
      generate: async () => 1,
      validate: () => fail(),
      critique: async () => {
        critiques += 1
        return { reasoning: 'x'.repeat(25), issues: [], verdict: 'PASS' }
      },
    })
    expect(critiques).toBe(0)
  })

  it('retries on a critic FAIL even when Tier 1 is clean', async () => {
    let n = 0
    const r = await runLoop<number>({
      stage: 't',
      maxAttempts: 3,
      generate: async () => {
        n += 1
        return n
      },
      validate: () => [],
      critique: async (v) =>
        v > 1
          ? { reasoning: 'Now properly supported by the cited text.', issues: [], verdict: 'PASS' }
          : {
              reasoning: 'The cited evidence says twelve, the claim says forty.',
              issues: [{ claimId: 'R2', problem: 'headcount inflated', fix: 'use twelve' }],
              verdict: 'FAIL',
            },
    })
    expect(r.attempts).toBe(2)
    expect(r.needsHumanReview).toBe(false)
  })

  it('passes the critic reasoning into the retry instruction', async () => {
    const seen: (string | null)[] = []
    await runLoop<number>({
      stage: 't',
      maxAttempts: 2,
      generate: async (fb) => {
        seen.push(fb)
        return 1
      },
      validate: () => [],
      critique: async () => ({
        reasoning: 'The cited evidence says twelve, the claim says forty.',
        issues: [{ claimId: 'R2', problem: 'headcount inflated', fix: 'change forty to twelve' }],
        verdict: 'FAIL',
      }),
    })
    expect(seen[1]).toContain('the claim says forty')
    expect(seen[1]).toContain('change forty to twelve')
  })

  it('emits events a UI can render the loop from', async () => {
    const events: string[] = []
    await runLoop<{ ok: boolean }>({
      stage: 'synthesize',
      maxAttempts: 2,
      generate: async (_f, n) => ({ ok: n > 1 }),
      validate: (v) => (v.ok ? [] : fail()),
      onEvent: (e) => events.push(e.t),
    })
    expect(events).toEqual(['attempt', 'validated', 'retry', 'attempt', 'validated', 'settled'])
  })

  it('absorbs a truncation and retries smaller instead of killing the run', async () => {
    // Letting a TruncationError propagate would throw away seven completed
    // stages over one oversized response. The "do not hard-fail on the first
    // bad output" principle applies to the generate step, not just validate.
    const seen: (string | null)[] = []
    let n = 0
    const r = await runLoop<string>({
      stage: 'poc',
      maxAttempts: 3,
      generate: async (fb) => {
        seen.push(fb)
        n += 1
        if (n === 1) {
          const e = new Error('hit its output limit')
          e.name = 'TruncationError'
          throw e
        }
        return 'ok'
      },
      validate: () => [],
    })
    expect(r.value).toBe('ok')
    expect(r.attempts).toBe(2)
    expect(seen[1]).toContain('SUBSTANTIALLY SMALLER')
  })

  it('absorbs a schema violation the same way, passing the validator message on', async () => {
    let n = 0
    const seen: (string | null)[] = []
    await runLoop<string>({
      stage: 's',
      maxAttempts: 2,
      generate: async (fb) => {
        seen.push(fb)
        if (++n === 1) {
          const e = new Error('screens: array must contain at least 2 elements')
          e.name = 'SchemaViolationError'
          throw e
        }
        return 'ok'
      },
      validate: () => [],
    })
    expect(seen[1]).toContain('at least 2 elements')
  })

  it('does NOT retry an auth or network failure — that just burns the attempts', async () => {
    let n = 0
    await expect(
      runLoop<string>({
        stage: 's',
        maxAttempts: 3,
        generate: async () => {
          n += 1
          throw new Error('401 Incorrect API key provided')
        },
        validate: () => [],
      }),
    ).rejects.toThrow(/401/)
    expect(n).toBe(1)
  })

  it('throws only when NO attempt ever produced anything usable', async () => {
    await expect(
      runLoop<string>({
        stage: 's',
        maxAttempts: 2,
        generate: async () => {
          const e = new Error('output limit')
          e.name = 'TruncationError'
          throw e
        },
        validate: () => [],
      }),
    ).rejects.toThrow(/output limit/)
  })

  it('falls back to an earlier good attempt when a later one blows up', async () => {
    // This happened for real: attempt 1 produced a valid POC spec, a false
    // positive in a validator rejected it, and attempt 2 responded by
    // generating five times as much and truncating. Losing the stage at that
    // point discards a perfectly good answer.
    let n = 0
    const r = await runLoop<string>({
      stage: 'poc',
      maxAttempts: 3,
      generate: async () => {
        n += 1
        if (n === 1) return 'the good spec'
        const e = new Error('hit its output limit')
        e.name = 'TruncationError'
        throw e
      },
      validate: (v) =>
        v === 'the good spec'
          ? [{ code: 'PLACEHOLDER', claimId: 'SC1', detail: 'false positive', severity: 'ERROR' }]
          : [],
    })

    expect(r.value).toBe('the good spec')
    expect(r.needsHumanReview).toBe(true)
    expect(r.violations.some((v) => v.detail.includes('output limit'))).toBe(true)
  })

  it('emits abandoned when it gives up', async () => {
    const events: string[] = []
    await runLoop<number>({
      stage: 's',
      maxAttempts: 2,
      generate: async () => 1,
      validate: () => fail(),
      onEvent: (e) => events.push(e.t),
    })
    expect(events).toContain('abandoned')
    expect(events).not.toContain('settled')
  })
})
