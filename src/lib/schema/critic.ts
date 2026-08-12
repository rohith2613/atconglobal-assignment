import { z } from 'zod'
import { spec } from './common'

/**
 * The adversarial critic's verdict.
 *
 * FIELD ORDER IS LOAD-BEARING. `reasoning` is declared first and `verdict` last,
 * and zodToJsonSchema preserves declaration order, so the model must generate
 * its analysis before it emits the verdict token.
 *
 * With the fields reversed the verdict is sampled first and the "reasoning" is
 * then written to justify a decision already fixed — it reads exactly as well,
 * cites the same evidence, and tells you nothing. I shipped that bug in an
 * earlier project and only caught it when a critic that was rejecting good
 * edits started passing them the moment the order changed. There is a test that
 * asserts this ordering so it cannot regress.
 */
export const CriticVerdict = z.object({
  reasoning: z.string().min(20),
  issues: z.array(
    z.object({
      claimId: z.string(),
      problem: z.string().min(5),
      /** Written as an instruction, because it is fed back verbatim on retry. */
      fix: z.string().min(5),
    }),
  ),
  verdict: z.enum(['PASS', 'FAIL']),
})
export type CriticVerdict = z.infer<typeof CriticVerdict>
export const CRITIC_SPEC = spec('critic_verdict', CriticVerdict)

/**
 * A false PASS is far more costly than a false FAIL, and the prompt says so.
 *
 * The asymmetry is real: a false FAIL costs one more cheap call, while a false
 * PASS puts an unsupported claim into a document a client will make decisions
 * from. The critic is also a separate call from a separate role — an extractor
 * asked to grade its own completion says yes essentially always.
 */
export const CRITIC_SYSTEM = `You are an adversarial reviewer on a consulting engagement. Your job is to find what is wrong with the analysis in front of you, not to be agreeable.

You will be shown claims and, for each, the exact source evidence they cite. Judge ONLY against that evidence.

FAIL a claim when any of these hold:
- The evidence does not actually support the claim, or supports something weaker.
- The claim states as fact something the evidence merely implies or hints at.
- A number, date, name or quantity in the claim does not appear in the evidence.
- The claim generalises one person's offhand remark into a firm requirement.
- The claim is a recommendation dressed as an observation about the client.

Do NOT fail a claim merely because it is summarised, reworded, or shorter than the evidence. Faithful compression is the job.

A false PASS is far more costly than a false FAIL. A false FAIL costs one more cheap call. A false PASS puts an unsupported claim into a document the client will make decisions from, with a citation next to it that makes it look verified.

If you are uncertain whether the evidence supports a claim, FAIL it and say what would settle the question.

Every issue you raise must name the claim id and give a concrete fix, written as an instruction — your fixes are fed back verbatim as the instruction for the next attempt.`
