import type { SourceType } from '../types'

/** A pre-evidence chunk carrying its own human-meaningful position. */
export type Segment = { locator: string; text: string }

export type RawSource = {
  type: SourceType
  name: string
  /**
   * Normalised display text. This is what the evidence drawer renders, so it
   * carries locator headers for readability.
   *
   * INVARIANT: every `segments[i].text` appears in `text` as a literal
   * substring, in order. `buildDisplayText` is the only sanctioned way to
   * produce this, and it establishes the invariant by construction — the
   * evidence layer's char offsets depend on it.
   */
  text: string
  segments: Segment[]
  meta: Record<string, string | number>
}

/**
 * Renders segments into readable display text while guaranteeing each segment
 * remains a literal in-order substring.
 */
export function buildDisplayText(segments: Segment[]): string {
  return segments.map((s) => `[${s.locator}]\n${s.text}`).join('\n\n')
}

/** Collapses CRLF and stray unicode spaces without touching content. */
export function normaliseNewlines(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/ | |‎|‏/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
}
