import type { CriticVerdict } from '../schema/critic'
import { toFeedback } from './validators'
import { blocking, type LoopEvent, type LoopResult, type Violation } from './types'

export type LoopArgs<T> = {
  stage: string
  maxAttempts: number
  /** `feedback` is null on the first attempt and the failure text thereafter. */
  generate: (feedback: string | null, attempt: number) => Promise<T>
  validate: (value: T) => Violation[] | Promise<Violation[]>
  /** Tier 2. Skipped entirely when Tier 1 already failed — no point paying for a
   *  semantic opinion on something structurally broken. */
  critique?: (value: T, attempt: number) => Promise<CriticVerdict>
  onEvent?: (e: LoopEvent) => void
}

/**
 * The closed loop: generate → verify → feed the failure back as the next
 * instruction → retry → abandon with a report.
 *
 * The model is treated as an unreliable component inside a control loop rather
 * than as the system itself. That is what lets the whole be more reliable than
 * the part, and it is the only reason a single-shot LLM call can be trusted with
 * a document a client will make decisions from.
 *
 * Two details that matter more than they look:
 *
 * 1. Tier 1 runs before Tier 2 and short-circuits it. Deterministic checks are
 *    free and catch the common failures; there is no sense paying a model to
 *    opine on whether a claim is *right* when we already know its citation
 *    points at nothing.
 *
 * 2. On abandonment the loop returns the BEST attempt, not the last one. Later
 *    attempts are not monotonically better — a model told to fix three things
 *    will sometimes fix two and break a fourth. Returning the last attempt
 *    silently ships a regression.
 */
export async function runLoop<T>(args: LoopArgs<T>): Promise<LoopResult<T>> {
  const { stage, maxAttempts, onEvent = () => {} } = args

  let feedback: string | null = null
  let best: { value: T; violations: Violation[]; errors: number } | null = null
  let attempt = 0

  while (attempt < maxAttempts) {
    attempt += 1
    onEvent({ t: 'attempt', stage, attempt })

    let value: T
    try {
      value = await args.generate(feedback, attempt)
    } catch (err) {
      // A model that overran its output budget or produced a shape Zod rejected
      // has failed in exactly the way this loop exists to absorb. Letting it
      // propagate would throw away seven completed stages over one oversized
      // response — the "do not hard-fail on the first bad output" principle
      // applied to the generate step and not just the validate step.
      const retryable = retryableFeedback(err, attempt)

      if (retryable && attempt < maxAttempts) {
        feedback = retryable
        onEvent({ t: 'retry', stage, attempt, because: describe(err) })
        continue
      }

      // Out of attempts, or the failure is not one retrying can fix. If an
      // earlier attempt produced something usable, ship that flagged rather
      // than losing the stage — throwing away a good answer because a later
      // one overran is the same mistake in a different place.
      if (best) {
        onEvent({ t: 'abandoned', stage, attempts: attempt, violations: best.violations })
        return {
          value: best.value,
          attempts: attempt,
          needsHumanReview: true,
          violations: [
            ...best.violations,
            { code: 'EMPTY_SECTION', claimId: stage, detail: describe(err), severity: 'WARN' },
          ],
        }
      }

      throw err
    }

    const violations = await args.validate(value)
    onEvent({ t: 'validated', stage, attempt, violations })

    const errors = blocking(violations)

    // Keep the best attempt seen so far, ties going to the earlier one.
    if (!best || errors.length < best.errors) {
      best = { value, violations, errors: errors.length }
    }

    if (errors.length > 0) {
      if (attempt >= maxAttempts) break
      feedback = toFeedback(violations, attempt)
      onEvent({
        t: 'retry',
        stage,
        attempt,
        because: `${errors.length} deterministic ${errors.length === 1 ? 'violation' : 'violations'}: ${errors.map((e) => e.code).join(', ')}`,
      })
      continue
    }

    // Tier 1 clean. Now, and only now, spend a model on the semantic question.
    if (args.critique) {
      const verdict = await args.critique(value, attempt)
      onEvent({ t: 'critiqued', stage, attempt, verdict: verdict.verdict, issues: verdict.issues.length })

      if (verdict.verdict === 'FAIL' && verdict.issues.length > 0) {
        if (attempt >= maxAttempts) {
          best = {
            value,
            violations: [
              ...violations,
              ...verdict.issues.map(
                (i): Violation => ({
                  code: 'UNGROUNDED_CLAIM',
                  claimId: i.claimId,
                  detail: `Critic: ${i.problem}`,
                  severity: 'WARN',
                }),
              ),
            ],
            errors: 0,
          }
          break
        }
        feedback = criticFeedback(verdict, attempt)
        onEvent({ t: 'retry', stage, attempt, because: `critic FAIL: ${verdict.issues.length} issue(s)` })
        continue
      }
    }

    onEvent({ t: 'settled', stage, attempts: attempt })
    return { value, attempts: attempt, needsHumanReview: false, violations }
  }

  // Out of attempts. Ship the best attempt, flagged — never silently.
  const result = best!
  onEvent({ t: 'abandoned', stage, attempts: attempt, violations: result.violations })
  return { value: result.value, attempts: attempt, needsHumanReview: true, violations: result.violations }
}

const describe = (err: unknown) => (err instanceof Error ? `${err.name}: ${err.message.slice(0, 90)}` : String(err))

/**
 * Turns a generation-time error into an instruction for the next attempt, or
 * null if it is not the kind of failure retrying can help with.
 *
 * Truncation and schema violations are the model's fault and a smaller, better
 * shaped answer fixes them. Authentication, rate limits and network failures
 * are not, and retrying them just burns the remaining attempts.
 */
function retryableFeedback(err: unknown, attempt: number): string | null {
  if (!(err instanceof Error)) return null

  if (err.name === 'TruncationError') {
    return [
      `Attempt ${attempt} ran past the output limit and was discarded.`,
      '',
      'Produce a SUBSTANTIALLY SMALLER answer. Keep the same structure and quality, but cut the volume hard:',
      '- fewer items in every list, and no list longer than 8 entries',
      '- tables: 5 rows, not 20',
      '- shorter descriptive text everywhere',
      '',
      'A complete small answer is worth far more than a large one that gets cut off, because a cut-off one is discarded entirely.',
    ].join('\n')
  }

  // A connection that never reached the model is a transport fault, and the
  // SDK has already exhausted its own backoff by the time it surfaces here.
  // Regenerating with different instructions would not help; failing loudly is
  // the honest outcome and the run is resumable from its saved artifacts.
  if (/ENOTFOUND|ECONNRESET|ECONNREFUSED|EAI_AGAIN|socket hang up/i.test(err.message)) return null

  if (err.name === 'APIConnectionTimeoutError' || /timed? ?out|aborted/i.test(err.message)) {
    // With output ceilings in place, a request that runs past its deadline is
    // almost always a runaway generation rather than a network fault, so the
    // useful retry is a smaller one.
    return [
      `Attempt ${attempt} ran past its deadline and was cancelled.`,
      '',
      'Produce a much shorter answer. Halve the number of items in every list and keep all descriptive text to one sentence.',
    ].join('\n')
  }

  if (err.name === 'SchemaViolationError') {
    return [
      `Attempt ${attempt} did not match the required output shape and was discarded.`,
      '',
      `The validator reported: ${err.message}`,
      '',
      'Return the same content in the exact shape the schema requires.',
    ].join('\n')
  }

  return null
}

function criticFeedback(verdict: CriticVerdict, attempt: number): string {
  return [
    `Attempt ${attempt} passed structural checks but was rejected on review.`,
    '',
    `Reviewer's reasoning: ${verdict.reasoning}`,
    '',
    'Fix exactly these and change nothing else:',
    '',
    ...verdict.issues.map((i, n) => `${n + 1}. ${i.claimId}: ${i.problem}\n   → ${i.fix}`),
  ].join('\n')
}
