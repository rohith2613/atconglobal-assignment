import type { LlmClient } from '../llm/types'
import type { SourceType } from '../types'
import { parseAudio } from './audio'
import { parseNotes } from './notes'
import { parsePdf } from './pdf'
import { parseScreenshot } from './screenshot'
import { parseTranscript } from './transcript'
import { looksLikeWhatsapp, parseWhatsapp } from './whatsapp'
import { fetchWebsite, parseHtml } from './website'
import type { RawSource } from './types'

export * from './types'
export { parseTranscript } from './transcript'
export { parseWhatsapp, looksLikeWhatsapp } from './whatsapp'
export { parseNotes } from './notes'
export { parsePdf } from './pdf'
export { parseScreenshot } from './screenshot'
export { parseAudio } from './audio'
export { fetchWebsite, parseHtml } from './website'

const EXT: Record<string, SourceType> = {
  pdf: 'pdf',
  png: 'screenshot',
  jpg: 'screenshot',
  jpeg: 'screenshot',
  webp: 'screenshot',
  gif: 'screenshot',
  mp3: 'audio',
  m4a: 'audio',
  wav: 'audio',
  ogg: 'audio',
  webm: 'audio',
  mp4: 'audio',
  vtt: 'transcript',
  srt: 'transcript',
  html: 'website',
  htm: 'website',
  md: 'notes',
  markdown: 'notes',
}

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

const ext = (filename: string) => filename.split('.').pop()?.toLowerCase() ?? ''

/**
 * Extension first, then content sniffing for the ambiguous case.
 *
 * `.txt` is the ambiguous one and it is the most common thing a consultant
 * actually receives — it could be a Teams transcript, a WhatsApp export, or
 * loose notes. Getting it wrong silently produces garbage evidence locators, so
 * the sniff runs before falling back to notes.
 */
export function detectType(filename: string, content?: Buffer): SourceType {
  const e = ext(filename)
  if (EXT[e]) return EXT[e]

  const head = content ? content.subarray(0, 8192).toString('utf8') : ''

  // Trust magic bytes over a wrong extension.
  if (head.startsWith('%PDF')) return 'pdf'
  if (/^\s*WEBVTT/.test(head)) return 'transcript'

  if (e === 'txt' || e === '') {
    if (looksLikeWhatsapp(head)) return 'whatsapp'
    // Two or more `[hh:mm(:ss)] Name:` or `Name (hh:mm):` lines reads as a
    // meeting transcript. One is a coincidence.
    const timestamped = head
      .split('\n')
      .filter((l) =>
        /^\s*\[\d{1,2}:\d{2}(:\d{2})?\]\s*[^:]{1,60}:/.test(l) ||
        /^\s*[^:(]{1,60}\s*\(\d{1,2}:\d{2}(:\d{2})?\):/.test(l),
      ).length
    if (timestamped >= 2) return 'transcript'
    return 'notes'
  }

  if (/^\s*</.test(head) && /<html|<!doctype/i.test(head)) return 'website'
  return 'notes'
}

export type IngestArgs = {
  filename: string
  buffer: Buffer
  runId: string
  engagementId: string
  llm?: LlmClient
  /** Forces a type instead of detecting it. */
  type?: SourceType
}

/**
 * One entry point for every source type. Screenshot and audio need an LlmClient;
 * the other five are pure functions of their bytes and run with no key.
 */
export async function ingest(args: IngestArgs): Promise<RawSource> {
  const type = args.type ?? detectType(args.filename, args.buffer)
  const name = args.filename

  switch (type) {
    case 'transcript':
      return parseTranscript(name, args.buffer.toString('utf8'))
    case 'whatsapp':
      return parseWhatsapp(name, args.buffer.toString('utf8'))
    case 'notes':
      return parseNotes(name, args.buffer.toString('utf8'))
    case 'pdf':
      return parsePdf(name, args.buffer)
    case 'website':
      return parseHtml(`file://${name}`, args.buffer.toString('utf8'))

    case 'screenshot': {
      if (!args.llm) throw new Error(`Reading "${name}" needs a vision model; no API key is configured.`)
      return parseScreenshot(name, args.buffer, MIME[ext(name)] ?? 'image/png', args.llm, args)
    }
    case 'audio': {
      if (!args.llm) throw new Error(`Transcribing "${name}" needs Whisper; no API key is configured.`)
      return parseAudio(name, args.buffer, args.llm, args)
    }
  }
}

/** Website ingestion by URL rather than by uploaded bytes. */
export async function ingestUrl(url: string): Promise<RawSource> {
  return fetchWebsite(url)
}
