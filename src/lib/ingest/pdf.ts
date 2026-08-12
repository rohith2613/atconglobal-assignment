import { extractText, getDocumentProxy } from 'unpdf'
import { buildDisplayText, normaliseNewlines, type RawSource, type Segment } from './types'

/**
 * Paragraph-level segmentation inside each page.
 *
 * Page-level units would be too coarse to cite usefully — "p.4" as the evidence
 * for a requirement is barely better than "the PDF". PDF text extraction gives
 * hard-wrapped lines rather than paragraphs, so blank lines and short trailing
 * lines are used to infer paragraph ends, and single newlines inside a
 * paragraph are unwrapped.
 */
function splitPage(pageText: string): string[] {
  const lines = normaliseNewlines(pageText)
    .split('\n')
    .map((l) => l.trim())

  const paras: string[] = []
  let buf: string[] = []

  const flush = () => {
    if (buf.length) {
      paras.push(buf.join(' ').replace(/\s+/g, ' ').trim())
      buf = []
    }
  }

  for (const line of lines) {
    if (!line) {
      flush()
      continue
    }
    // A heading or numbered clause starts a new unit even without a blank line.
    if (/^(\d+(\.\d+)*\.?\s|[A-Z][A-Z \-]{4,}$|#{1,6}\s)/.test(line) && buf.length) flush()
    buf.push(line)
    // A short line that ends a sentence is a paragraph end, not a wrap.
    if (line.length < 60 && /[.!?:]$/.test(line)) flush()
  }
  flush()

  return paras.filter((p) => p.length > 2)
}

export async function parsePdf(name: string, buffer: Buffer): Promise<RawSource> {
  const doc = await getDocumentProxy(new Uint8Array(buffer))
  const { totalPages, text } = await extractText(doc, { mergePages: false })
  const pages: string[] = Array.isArray(text) ? text : [text]

  const segments: Segment[] = []
  pages.forEach((page, i) => {
    splitPage(page).forEach((para, j) => {
      segments.push({ locator: `p.${i + 1} ¶${j + 1}`, text: para })
    })
  })

  return {
    type: 'pdf',
    name,
    text: buildDisplayText(segments),
    segments,
    meta: { pages: totalPages, paragraphs: segments.length },
  }
}
