export type ViolationCode =
  /** A cited evidence id that is not in the corpus. Pure fabrication. */
  | 'HALLUCINATED_EVIDENCE'
  /** The quoted span is not actually in the evidence it cites. */
  | 'QUOTE_MISMATCH'
  /** A claim about the client with no citation at all. */
  | 'UNGROUNDED_CLAIM'
  /** A proposed feature that traces to no requirement — scope invented by the model. */
  | 'ORPHAN_FEATURE'
  /** A pain point that nothing in the proposal resolves. */
  | 'UNADDRESSED_PAIN'
  /** Two sources disagree and no question was raised to settle it. */
  | 'UNRESOLVED_CONFLICT'
  /** A screen, flow or spec referencing a role or screen that does not exist. */
  | 'ROLE_UNDEFINED'
  | 'DANGLING_REFERENCE'
  /** TBD, TODO, lorem — an unfinished output presented as a finished one. */
  | 'PLACEHOLDER'
  | 'EMPTY_SECTION'
  | 'DUPLICATE_ID'

export type Severity = 'ERROR' | 'WARN'

export type Violation = {
  code: ViolationCode
  /** Which claim failed, e.g. "R-004", "goal", "feature F2". */
  claimId: string
  detail: string
  severity: Severity
}

/**
 * ERROR triggers a retry; WARN is reported but tolerated.
 *
 * The split is about whether a human reading the output would be misled. A
 * fabricated citation misleads — it carries the visual authority of a source
 * reference with nothing behind it. A low-impact pain point nobody addressed is
 * a judgement call worth surfacing but not worth spending three more calls on.
 */
export const isBlocking = (v: Violation) => v.severity === 'ERROR'
export const blocking = (vs: Violation[]) => vs.filter(isBlocking)

export type LoopEvent =
  | { t: 'attempt'; stage: string; attempt: number }
  | { t: 'validated'; stage: string; attempt: number; violations: Violation[] }
  | { t: 'critiqued'; stage: string; attempt: number; verdict: 'PASS' | 'FAIL'; issues: number }
  | { t: 'retry'; stage: string; attempt: number; because: string }
  | { t: 'abandoned'; stage: string; attempts: number; violations: Violation[] }
  | { t: 'settled'; stage: string; attempts: number }

export type LoopResult<T> = {
  value: T
  attempts: number
  /** True when the loop exhausted its attempts. The output still ships, flagged. */
  needsHumanReview: boolean
  violations: Violation[]
}
