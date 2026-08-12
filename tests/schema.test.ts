import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { DISCOVERY_CHECKLIST, GAP_DIMENSIONS, CHECKLIST_BY_ID } from '@/lib/ontology/discovery-checklist'
import { CriticVerdict, CRITIC_SYSTEM } from '@/lib/schema/critic'
import { zodToJsonSchema, spec, Citation } from '@/lib/schema/common'
import { AppSpec, BLOCK_KINDS } from '@/lib/schema/appspec'
import { Brief } from '@/lib/schema/brief'
import { Blueprint } from '@/lib/schema/blueprint'
import { Signal, SIGNALS_SPEC } from '@/lib/schema/signals'

type JS = { type?: unknown; properties?: Record<string, JS>; required?: string[]; additionalProperties?: unknown; items?: JS; enum?: unknown[]; anyOf?: JS[] }

describe('discovery checklist', () => {
  it('has exactly 30 questions with unique ids', () => {
    expect(DISCOVERY_CHECKLIST).toHaveLength(30)
    expect(new Set(DISCOVERY_CHECKLIST.map((q) => q.id)).size).toBe(30)
  })

  it('covers all eight dimensions, none empty', () => {
    for (const d of GAP_DIMENSIONS) {
      expect(DISCOVERY_CHECKLIST.filter((q) => q.dimension === d).length, d).toBeGreaterThan(0)
    }
    expect(new Set(DISCOVERY_CHECKLIST.map((q) => q.dimension)).size).toBe(8)
  })

  it('gives every question a consequence — a question without one reads as bureaucracy', () => {
    for (const q of DISCOVERY_CHECKLIST) {
      expect(q.whyItMatters.length, q.id).toBeGreaterThan(30)
      expect(q.question.trim().endsWith('?'), q.id).toBe(true)
    }
  })

  it('indexes by id', () => {
    expect(CHECKLIST_BY_ID.NF2.question).toContain('SSO')
  })
})

describe('critic schema field order', () => {
  it('emits reasoning before verdict so the verdict is not sampled first', () => {
    // With the order reversed, the verdict token is generated before any
    // analysis and the "reasoning" is written to justify a decision already
    // fixed. It reads just as well and tells you nothing.
    const props = Object.keys((zodToJsonSchema(CriticVerdict) as JS).properties!)
    expect(props.indexOf('reasoning')).toBeLessThan(props.indexOf('verdict'))
    expect(props.indexOf('issues')).toBeLessThan(props.indexOf('verdict'))
  })

  it('states the asymmetry between a false pass and a false fail', () => {
    expect(CRITIC_SYSTEM).toContain('false PASS is far more costly')
  })
})

describe('gap schema field order', () => {
  it('reaches a status after summarising evidence, not before', async () => {
    const { GapResult } = await import('@/lib/schema/gaps')
    const props = Object.keys((zodToJsonSchema(GapResult) as JS).properties!)
    expect(props.indexOf('evidenceSummary')).toBeLessThan(props.indexOf('status'))
  })
})

describe('zodToJsonSchema', () => {
  it('marks every property required and forbids extras, as strict mode demands', () => {
    const s = zodToJsonSchema(CriticVerdict) as JS
    expect(s.additionalProperties).toBe(false)
    expect(s.required).toEqual(['reasoning', 'issues', 'verdict'])
  })

  it('renders nullable fields as a null-union type', () => {
    const s = zodToJsonSchema(z.object({ a: z.string().nullable() })) as JS
    expect(s.properties!.a.type).toEqual(['string', 'null'])
  })

  it('drops .min() constraints, which strict mode rejects', () => {
    // These survive as Zod re-validation in process. The API guarantees shape;
    // Zod guarantees substance.
    const s = zodToJsonSchema(z.object({ a: z.string().min(5), b: z.array(z.number()).min(2) })) as JS
    expect(s.properties!.a).toEqual({ type: 'string' })
    expect(JSON.stringify(s)).not.toContain('minLength')
    expect(JSON.stringify(s)).not.toContain('minItems')
  })

  it('renders enums as string enums', () => {
    const s = zodToJsonSchema(z.object({ a: z.enum(['X', 'Y']) })) as JS
    expect(s.properties!.a).toEqual({ type: 'string', enum: ['X', 'Y'] })
  })

  it('renders a discriminated union as anyOf over object branches', () => {
    const u = z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('a'), x: z.string() }),
      z.object({ kind: z.literal('b'), y: z.number() }),
    ])
    const s = zodToJsonSchema(u) as JS
    expect(s.anyOf).toHaveLength(2)
    expect(s.anyOf![0].properties!.kind).toEqual({ type: 'string', enum: ['a'] })
  })

  it('throws on a type it cannot faithfully express rather than emitting something wrong', () => {
    expect(() => zodToJsonSchema(z.map(z.string(), z.string()))).toThrow(/does not handle/)
  })

  it('spec() bundles name, zod and json together', () => {
    const s = spec('thing', z.object({ a: z.string() }))
    expect(s.name).toBe('thing')
    expect((s.json as JS).type).toBe('object')
    expect(s.zod.parse({ a: 'x' })).toEqual({ a: 'x' })
  })
})

describe('Citation', () => {
  it('requires at least one evidence id — an uncited claim is not a claim', () => {
    expect(() => Citation.parse({ evidenceIds: [], quote: 'something' })).toThrow()
  })

  it('requires a quote long enough to verify', () => {
    expect(() => Citation.parse({ evidenceIds: ['E-1'], quote: 'a' })).toThrow()
  })

  it('accepts a well-formed citation', () => {
    expect(Citation.parse({ evidenceIds: ['E-s1-001'], quote: 'we quote by hand' })).toBeTruthy()
  })
})

describe('Signal', () => {
  it('rejects a signal with no citation', () => {
    expect(() =>
      Signal.parse({
        id: 'S1',
        type: 'PAIN_POINT',
        statement: 'quoting is slow',
        detail: '',
        subject: 'quoting',
        confidence: 'HIGH',
      }),
    ).toThrow()
  })

  it('rejects an unknown signal type', () => {
    expect(() =>
      Signal.parse({
        id: 'S1',
        type: 'VIBES',
        statement: 'quoting is slow',
        detail: '',
        subject: 'quoting',
        citation: { evidenceIds: ['E-1'], quote: 'slow' },
        confidence: 'HIGH',
      }),
    ).toThrow()
  })

  it('exposes a usable JSON schema for the API call', () => {
    expect((SIGNALS_SPEC.json as JS).type).toBe('object')
    expect(SIGNALS_SPEC.name).toBe('signals')
  })
})

describe('AppSpec', () => {
  const valid = {
    appName: 'Nordwind Quote Desk',
    tagline: 'One queue, one quote, no spreadsheets',
    roles: [{ id: 'RO1', name: 'Quotation Desk' }],
    screens: [
      {
        id: 'SC1',
        name: 'Queue',
        icon: 'inbox',
        roleIds: ['RO1'],
        blocks: [
          {
            kind: 'table',
            title: 'Open RFQs',
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
        name: 'Quote',
        icon: 'file',
        roleIds: ['RO1'],
        blocks: [
          {
            kind: 'detail',
            title: 'RFQ-1041',
            fields: [
              { label: 'Customer', value: 'Bergen Seafood' },
              { label: 'Lane', value: 'Bergen → Rotterdam' },
            ],
            actions: [{ label: 'Send quote', target: null }],
          },
        ],
      },
    ],
  }

  it('accepts a well-formed spec', () => {
    expect(() => AppSpec.parse(valid)).not.toThrow()
  })

  it('rejects a single-screen spec — a POC with nothing to click is not a POC', () => {
    expect(() => AppSpec.parse({ ...valid, screens: valid.screens.slice(0, 1) })).toThrow()
  })

  it('rejects an unknown block kind', () => {
    const bad = structuredClone(valid)
    ;(bad.screens[0].blocks[0] as { kind: string }).kind = 'carousel'
    expect(() => AppSpec.parse(bad)).toThrow()
  })

  it('rejects an unknown icon, which would render as a broken glyph', () => {
    const bad = structuredClone(valid)
    bad.screens[0].icon = 'sparkles'
    expect(() => AppSpec.parse(bad)).toThrow()
  })

  it('rejects a screen visible to no role', () => {
    const bad = structuredClone(valid)
    bad.screens[0].roleIds = []
    expect(() => AppSpec.parse(bad)).toThrow()
  })

  it('lists all eight block kinds', () => {
    expect(BLOCK_KINDS).toHaveLength(8)
  })
})

describe('Brief and Blueprint shapes', () => {
  it('Brief requires a citation on the goal', () => {
    const props = (zodToJsonSchema(Brief) as JS).properties!
    expect(Object.keys(props.goal.properties!)).toContain('citation')
  })

  it('Blueprint requires at least one requirement id per feature', () => {
    expect(() =>
      Blueprint.shape.features.parse([
        { id: 'F1', name: 'Quote builder', description: 'builds quotes', requirementIds: [], priority: 'P0', effort: 'M' },
      ]),
    ).toThrow()
  })

  it('every schema this project sends to the API converts without throwing', () => {
    for (const s of [Brief, Blueprint, AppSpec, CriticVerdict, Signal]) {
      expect(() => zodToJsonSchema(s)).not.toThrow()
    }
  })
})
