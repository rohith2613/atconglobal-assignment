import { describe, it, expect } from 'vitest'
import { priceFor, costOf, ROLES, config } from '@/lib/config'
import { OpenAiClient, AnthropicClient, MissingKeyError, TruncationError } from '@/lib/llm'

describe('priceFor', () => {
  it('returns published prices for a known model', () => {
    expect(priceFor('gpt-4.1-mini')).toEqual({ inPerM: 0.4, outPerM: 1.6 })
  })

  it('falls back to zero for an unknown model rather than throwing', () => {
    // A missing price must never be able to fail a run. The trace is
    // instrumentation, not control flow.
    expect(priceFor('some-future-model')).toEqual({ inPerM: 0, outPerM: 0 })
  })
})

describe('costOf', () => {
  it('bills input and output at their separate rates', () => {
    // 1M in @ $0.40 + 0.5M out @ $1.60 = 0.40 + 0.80
    expect(costOf('gpt-4.1-mini', 1_000_000, 500_000)).toBeCloseTo(1.2, 6)
  })

  it('is zero for an unpriced model', () => {
    expect(costOf('mystery-model', 999_999, 999_999)).toBe(0)
  })
})

describe('config', () => {
  it('has a model configured for every role', () => {
    for (const role of ROLES) {
      expect(config.models[role], `no model for role "${role}"`).toBeTruthy()
    }
  })

  it('puts the strong model on synthesis and the cheap one on extraction', () => {
    // The whole cost story depends on this split. If someone flips it by
    // accident the bill changes by an order of magnitude.
    expect(config.models.extractor).toContain('mini')
    expect(config.models.synthesizer).not.toContain('mini')
  })
})

describe('provider contract', () => {
  // Both adapters must satisfy the same interface. Without an Anthropic key we
  // cannot exercise it live, but we can prove it is structurally complete —
  // which is what catches the "added a method to one, forgot the other" bug.
  it.each([
    ['OpenAiClient', new OpenAiClient('sk-test')],
    ['AnthropicClient', new AnthropicClient('sk-test')],
  ])('%s implements every LlmClient member', (_name, client) => {
    expect(typeof client.complete).toBe('function')
    expect(typeof client.transcribe).toBe('function')
    expect(typeof client.embed).toBe('function')
    expect(typeof client.supportsVision).toBe('boolean')
    expect(typeof client.supportsAudio).toBe('boolean')
  })
})

describe('error types', () => {
  it('TruncationError names the model and stage so the trace is actionable', () => {
    const e = new TruncationError('gpt-4.1', 'synthesize')
    expect(e.message).toContain('gpt-4.1')
    expect(e.message).toContain('synthesize')
    expect(e.name).toBe('TruncationError')
  })

  it('MissingKeyError points at demo mode instead of just failing', () => {
    expect(new MissingKeyError().message).toContain('demo run')
  })
})
