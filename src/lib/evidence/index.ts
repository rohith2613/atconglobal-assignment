import type { RawSource } from '../ingest/types'
import type { EvidenceUnit, SourceType } from '../types'

export type { EvidenceUnit }

/**
 * Folds the differences a model introduces when it quotes — smart quotes,
 * dash variants, non-breaking spaces, line wrapping, capitalisation — while
 * preserving everything that carries meaning.
 *
 * The line to hold: forgiving enough that a faithful quote is not rejected over
 * a curly apostrophe, strict enough that a fabricated one cannot slip past.
 * Words and numbers are never touched.
 */
export function normaliseForCompare(s: string): string {
  return s
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/[   ​]/g, ' ')
    .replace(/…/g, '...')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Splits a source into addressable, citable units.
 *
 * IDs are `E-{sourceId}-{nnn}`, assigned in document order, so they are stable
 * across runs for the same input — which is what lets a citation survive a
 * re-run and a cached demo replay.
 *
 * Char offsets are found by scanning forward from the previous match rather
 * than by a global indexOf. A transcript where someone says "yes" three times
 * would otherwise collapse all three onto the first occurrence, and the
 * evidence drawer would highlight the wrong line.
 */
export function segment(raw: RawSource, engagementId: string, sourceId: string): EvidenceUnit[] {
  const units: EvidenceUnit[] = []
  let cursor = 0

  raw.segments.forEach((seg, i) => {
    const at = raw.text.indexOf(seg.text, cursor)
    const charStart = at >= 0 ? at : cursor
    const charEnd = charStart + seg.text.length
    if (at >= 0) cursor = charEnd

    units.push({
      id: `E-${sourceId}-${String(i + 1).padStart(3, '0')}`,
      engagementId,
      sourceId,
      sourceType: raw.type as SourceType,
      locator: seg.locator,
      text: seg.text,
      charStart,
      charEnd,
      ordinal: i,
    })
  })

  return units
}

/**
 * The corpus of everything the client gave us, indexed for citation checking.
 *
 * This class is where "the model said it cites E-src2-014" becomes "E-src2-014
 * exists and really contains that sentence". Nothing else in the system is
 * allowed to assert groundedness.
 */
export class Corpus {
  private byId = new Map<string, EvidenceUnit>()
  private normCache = new Map<string, string>()

  constructor(public readonly units: EvidenceUnit[]) {
    for (const u of units) this.byId.set(u.id, u)
  }

  get size(): number {
    return this.byId.size
  }

  has(id: string): boolean {
    return this.byId.has(id)
  }

  get(id: string): EvidenceUnit | undefined {
    return this.byId.get(id)
  }

  bySource(sourceId: string): EvidenceUnit[] {
    return this.units.filter((u) => u.sourceId === sourceId)
  }

  private norm(id: string): string {
    let v = this.normCache.get(id)
    if (v === undefined) {
      v = normaliseForCompare(this.byId.get(id)?.text ?? '')
      this.normCache.set(id, v)
    }
    return v
  }

  /** True when `quote` is really present in the unit with that id. */
  supportsQuote(id: string, quote: string): boolean {
    if (!this.byId.has(id)) return false
    return containsQuote(this.norm(id), quote)
  }

  /**
   * True when the quote is supported by the cited units taken together.
   *
   * A claim legitimately drawn from two adjacent turns cites both, and its
   * quote spans the join. Checking each unit in isolation would reject that
   * and push the model toward citing less than it actually used.
   */
  supportsQuoteAcross(ids: string[], quote: string): boolean {
    const known = ids.filter((id) => this.byId.has(id))
    if (known.length === 0) return false
    if (known.some((id) => this.supportsQuote(id, quote))) return true
    return containsQuote(known.map((id) => this.norm(id)).join(' '), quote)
  }

  /**
   * Full text of a source with ids attached. Handed to the extractor, which
   * needs the exact words in order to quote them.
   */
  fullText(sourceId: string): string {
    return this.bySource(sourceId)
      .map((u) => `${u.id} [${u.locator}]\n${u.text}`)
      .join('\n\n')
  }

  /**
   * Compact map of the whole corpus for stages that reason across sources.
   *
   * Paid once per stage rather than once per claim — the cross-source stages
   * need to know what exists and roughly where, not to re-read every word.
   */
  outline(maxChars = 24_000): string {
    const lines: string[] = []
    let used = 0
    for (const u of this.units) {
      const snippet = u.text.length > 120 ? `${u.text.slice(0, 117)}...` : u.text
      const line = `${u.id} [${u.sourceType} · ${u.locator}] ${snippet.replace(/\n/g, ' ')}`
      if (used + line.length > maxChars) {
        lines.push(`… ${this.units.length - lines.length} further units omitted for length`)
        break
      }
      lines.push(line)
      used += line.length + 1
    }
    return lines.join('\n')
  }
}

/**
 * Substring match with ellipsis support. Models elide the middle of a long
 * quote as "we quote by hand … forty a day"; both halves must still be present,
 * and in order.
 */
function containsQuote(haystack: string, quote: string): boolean {
  const q = normaliseForCompare(quote)
  if (q.length === 0) return false

  const parts = q
    .split(/\s*\.{3,}\s*/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  if (parts.length <= 1) return haystack.includes(q)

  let cursor = 0
  for (const part of parts) {
    const at = haystack.indexOf(part, cursor)
    if (at < 0) return false
    cursor = at + part.length
  }
  return true
}
