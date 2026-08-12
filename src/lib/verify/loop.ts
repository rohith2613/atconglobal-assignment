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

    const value = await args.generate(feedback, attempt)
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
