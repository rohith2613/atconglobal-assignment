import * as cheerio from 'cheerio'
import { buildDisplayText, normaliseNewlines, type RawSource, type Segment } from './types'

const CHROME = 'script, style, noscript, nav, footer, header, svg, iframe, form, aside, [aria-hidden="true"]'

/**
 * A public site tells you what the client says they do, who they say it for,
 * and what vocabulary they use — which is exactly the terminology the brief
 * should adopt. It is a reference for understanding the current system, not a
 * design to copy.
 */
export async function fetchWebsite(url: string): Promise<RawSource> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Prism-Discovery/1.0 (+business analysis tool)' },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`Could not fetch ${url}: HTTP ${res.status}`)

  return parseHtml(url, await res.text())
}

export function parseHtml(url: string, html: string): RawSource {
  const $ = cheerio.load(html)
  $(CHROME).remove()

  const title = $('title').first().text().trim() || new URL(url).hostname
  const description = $('meta[name="description"]').attr('content')?.trim() ?? ''

  const segments: Segment[] = []
  if (description) {
    segments.push({ locator: `${new URL(url).hostname} · meta description`, text: description })
  }

  // Walk headings and body text in document order so a citation lands on the
  // section a reader would actually scroll to.
  let section = 'intro'
  $('h1, h2, h3, h4, p, li, td, blockquote').each((_, el) => {
    const tag = (el as { tagName?: string }).tagName?.toLowerCase() ?? ''
    const raw = $(el).text().replace(/\s+/g, ' ').trim()
    if (raw.length < 3) return

    if (/^h[1-4]$/.test(tag)) {
      section = raw.slice(0, 60)
      segments.push({ locator: `${title} · ${section}`, text: raw })
      return
    }
    if (raw.length < 12) return
    segments.push({ locator: `${title} · ${section}`, text: raw })
  })

  // Long pages repeat their nav copy in the footer and in CTAs; identical text
  // adds no evidence and would inflate every corroboration count.
  const seen = new Set<string>()
  const deduped = segments.filter((s) => {
    const k = s.text.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  return {
    type: 'website',
    name: title,
    text: buildDisplayText(deduped),
    segments: deduped,
    meta: { url, title, blocks: deduped.length, chars: normaliseNewlines($.text()).length },
  }
}
