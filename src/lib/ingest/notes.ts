import { buildDisplayText, normaliseNewlines, type RawSource, type Segment } from './types'

/**
 * Free-form notes and markdown. Segmented on blank lines, with the nearest
 * preceding heading carried into the locator so a citation reads
 * "Escalation rules ¶2" rather than "¶17".
 */
export function parseNotes(name: string, content: string): RawSource {
  const text = normaliseNewlines(content).trim()
  const segments: Segment[] = []

  let heading = ''
  let nWithinSection = 0

  for (const block of text.split(/\n{2,}/)) {
    const t = block.trim()
    if (!t) continue

    const h = /^#{1,6}\s+(.*)$/.exec(t)
    if (h) {
      heading = h[1].trim()
      nWithinSection = 0
      segments.push({ locator: `heading: ${heading}`, text: t })
      continue
    }

    nWithinSection += 1
    segments.push({
      locator: heading ? `${heading} ¶${nWithinSection}` : `¶${segments.length + 1}`,
      text: t,
    })
  }

  return {
    type: 'notes',
    name,
    text: buildDisplayText(segments),
    segments,
    meta: { blocks: segments.length, words: text.split(/\s+/).length },
  }
}
