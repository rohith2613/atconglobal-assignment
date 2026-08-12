import { config } from '../config'
import type { Corpus } from '../evidence'
import type { LlmClient } from '../llm/types'
import { SIGNALS_SPEC, type Signal, type SignalsOut } from '../schema/signals'
import type { Source } from '../types'
import { runLoop, validateSignals, type Violation } from '../verify'
import { mapWithConcurrency, type EventFn } from './events'

/**
 * Extraction runs once per source, concurrently.
 *
 * One source at a time is not an optimisation detail, it is the accuracy
 * decision. Handing the model the whole corpus at once produces signals that
 * blend two meetings into one claim and cite whichever evidence id was nearest.
 * Per-source, the model sees the exact words it must quote and a short list of
 * ids it is permitted to use, and the validator can check both.
 */

const SYSTEM = `You are a business analyst reading ONE source from a client discovery pack. Extract the business signals it contains.

You will be given numbered evidence units. Each has an id like E-src3-014 and its exact text.

RULES, in order of importance:

1. Every signal MUST cite at least one evidence id, and you may ONLY use ids from the list you were given. Never invent an id.

2. The "quote" field MUST be a contiguous run of characters copied out of the units you cite. It is checked character by character against the source, and a signal whose quote does not match is rejected and regenerated.
   Copy, do not retype. Do not tidy up grammar, expand contractions, fix spelling, merge two sentences, or drop a filler word.
   Given the unit text: "That takes about two days. Sometimes three."
     RIGHT: "That takes about two days."
     RIGHT: "takes about two days. Sometimes three."
     WRONG: "That takes about 2 days."            (changed "two" to "2")
     WRONG: "It takes about two days."            (changed "That" to "It")
     WRONG: "takes two days, sometimes three"     (dropped a word, changed punctuation)
   Shorter is safer. Quote the smallest span that supports the claim.
   If you need to skip material in the middle, join the parts with " ... " and keep both parts exactly as written.

3. Extract what the source says, not what you infer. "We lose deals because we are slow" is a PAIN_POINT. "They need a CRM" is not — nobody said it.

4. Use the client's own words for the statement wherever you can. Their vocabulary is the vocabulary the whole engagement will use.

SIGNAL TYPES:
- GOAL: an outcome the client wants
- CURRENT_PROCESS_STEP: something that happens today, in order
- PAIN_POINT: something that costs them time, money or business today
- REQUIREMENT: a capability the solution must have
- CONSTRAINT: a limit on the solution (policy, budget, regulation, existing system, a control that must remain)
- STAKEHOLDER: a named person or role and what they do
- SYSTEM: an existing tool or application and its role
- METRIC: a number about the business — volumes, headcounts, durations, values, frequencies
- DECISION: something already decided, by whom
- OPEN_QUESTION: something the source itself flags as unknown or unresolved

"subject" is the topic this signal is about, in two or three words, normalised: "go-live date", "user count", "quote turnaround", "approval control". A later stage groups signals by subject to find disagreements between sources, so consistent subjects matter more than clever ones.

confidence: HIGH when the source states it plainly as fact. MEDIUM when it is stated in passing or hedged. LOW when it is an aside, a joke, or one person's impression.

Be thorough. A source of any length usually contains between 8 and 30 signals. Do not merge distinct claims to be concise — a later stage does the merging, and it can only merge what you extracted.`

export async function extractFromSource(args: {
  source: Source
  corpus: Corpus
  llm: LlmClient
  runId: string
  engagementId: string
  onEvent: EventFn
}): Promise<{ signals: Signal[]; needsHumanReview: boolean; violations: Violation[] }> {
  const units = args.corpus.bySource(args.source.id)
  if (units.length === 0) return { signals: [], needsHumanReview: false, violations: [] }

  const body = args.corpus.fullText(args.source.id)

  const result = await runLoop<SignalsOut>({
    stage: 'extract',
    maxAttempts: config.maxAttempts,
    onEvent: (e) => {
      if (e.t === 'retry') args.onEvent({ t: 'attempt', stage: 'extract', attempt: e.attempt, because: e.because })
    },
    generate: async (feedback, attempt) => {
      const { data } = await args.llm.complete<SignalsOut>({
        role: 'extractor',
        stage: 'extract',
        runId: args.runId,
        engagementId: args.engagementId,
        attempt,
        system: SYSTEM,
        user: [
          `SOURCE: ${args.source.name} (${args.source.type})`,
          '',
          `You may cite ONLY these ${units.length} evidence ids:`,
          units.map((u) => u.id).join(', '),
          '',
          'EVIDENCE UNITS:',
          '',
          body,
          feedback ? `\n\n---\n\n${feedback}` : '',
        ].join('\n'),
        schema: SIGNALS_SPEC,
        summary: `extract signals from ${args.source.name}`,
      })

      // Ids are assigned here by position, not taken from the model. They are
      // namespaced per source so a merge across sources cannot collide two
      // unrelated signals that both called themselves "S1", and assigning them
      // deterministically makes duplicate ids structurally impossible rather
      // than something the validator has to catch and burn a retry on.
      return { signals: data.signals.map((s, i) => ({ ...s, id: `${args.source.id}:S${i + 1}` })) }
    },
    validate: (v) => validateSignals(v.signals, args.corpus),
  })

  return {
    signals: result.value.signals,
    needsHumanReview: result.needsHumanReview,
    violations: result.violations,
  }
}

export async function extractSignals(args: {
  sources: Source[]
  corpus: Corpus
  llm: LlmClient
  runId: string
  engagementId: string
  onEvent: EventFn
}): Promise<{ signals: Signal[]; needsHumanReview: boolean }> {
  const withEvidence = args.sources.filter((s) => args.corpus.bySource(s.id).length > 0)
  let done = 0

  const results = await mapWithConcurrency(withEvidence, config.concurrency, async (source) => {
    const r = await extractFromSource({ ...args, source })
    done += 1
    args.onEvent({
      t: 'progress',
      stage: 'extract',
      done,
      total: withEvidence.length,
      label: `${source.name} — ${r.signals.length} signals`,
    })
    return r
  })

  return {
    signals: results.flatMap((r) => r.signals),
    needsHumanReview: results.some((r) => r.needsHumanReview),
  }
}
