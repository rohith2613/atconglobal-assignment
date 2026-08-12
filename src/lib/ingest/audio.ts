import type { LlmClient } from '../llm/types'
import { buildDisplayText, type RawSource, type Segment } from './types'

/** mm:ss for locators — a reviewer scrubbing to a citation thinks in minutes. */
function stamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * Whisper returns short utterance-level segments — often half a sentence. Those
 * are too small to cite, so adjacent segments are merged until a unit is long
 * enough to stand on its own or a natural sentence end arrives.
 */
function coalesce(
  raw: { start: number; end: number; text: string }[],
  minChars = 140,
): { start: number; end: number; text: string }[] {
  const out: { start: number; end: number; text: string }[] = []
  for (const seg of raw) {
    const prev = out[out.length - 1]
    const endsSentence = /[.!?]$/.test(seg.text.trim())
    if (prev && prev.text.length < minChars) {
      prev.text = `${prev.text} ${seg.text}`.trim()
      prev.end = seg.end
      if (endsSentence && prev.text.length >= minChars) continue
    } else {
      out.push({ ...seg })
    }
  }
  return out
}

export async function parseAudio(
  name: string,
  buffer: Buffer,
  llm: LlmClient,
  ctx: { runId: string; engagementId: string },
): Promise<RawSource> {
  const { data } = await llm.transcribe({
    runId: ctx.runId,
    engagementId: ctx.engagementId,
    stage: 'ingest',
    file: buffer,
    filename: name,
  })

  const merged = coalesce(data.segments)

  // A transcription with no segment timings still has usable text; fall back to
  // one unit rather than dropping the whole source.
  const segments: Segment[] = merged.length
    ? merged.map((s) => ({
        locator: `${name} @ ${stamp(s.start)}–${stamp(s.end)}`,
        text: s.text.trim(),
      }))
    : [{ locator: `${name} @ full recording`, text: data.text.trim() }]

  const duration = merged.length ? merged[merged.length - 1].end : 0
  return {
    type: 'audio',
    name,
    text: buildDisplayText(segments),
    segments,
    meta: {
      durationSeconds: Math.round(duration),
      passages: segments.length,
      transcribedBy: 'whisper-1',
    },
  }
}
