/**
 * Runs ingest → segment → extract → reconcile over the real Nordwind corpus and
 * reports whether the planted contradictions were found.
 *
 * Run: npx tsx scripts/smoke-discovery.ts [--no-ai-sources]
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { getLlm } from '../src/lib/llm'
import { ingest } from '../src/lib/ingest'
import { segment, Corpus } from '../src/lib/evidence'
import { extractSignals } from '../src/lib/pipeline/extract'
import { reconcile } from '../src/lib/pipeline/reconcile'
import type { Source, SourceType } from '../src/lib/types'
import type { TraceEntry } from '../src/lib/llm/types'

const F = 'fixtures/nordwind'
const skipAi = process.argv.includes('--no-ai-sources')

const FILES: { file: string; type: SourceType }[] = [
  { file: 'transcript-kickoff.txt', type: 'transcript' },
  { file: 'transcript-followup.txt', type: 'transcript' },
  { file: 'whatsapp-ops-group.txt', type: 'whatsapp' },
  { file: 'quotation-sop-v3.2.pdf', type: 'pdf' },
  { file: 'website.html', type: 'website' },
  ...(skipAi
    ? []
    : ([
        { file: 'call-with-erik.mp3', type: 'audio' },
        { file: 'screen-1-nordquote-quotation-entry.png', type: 'screenshot' },
        { file: 'screen-2-carrier-rate-sheet.png', type: 'screenshot' },
        { file: 'screen-3-shared-quotes-mailbox.png', type: 'screenshot' },
      ] as const)),
]

const trace: TraceEntry[] = []
const t0 = Date.now()

async function main() {
  const llm = getLlm((e) => trace.push(e))
  const runId = 'smoke'
  const engagementId = 'smoke'

  console.log('INGEST')
  const sources: Source[] = []
  const units = []
  for (const [i, f] of FILES.entries()) {
    const raw = await ingest({
      filename: f.file,
      buffer: readFileSync(`${F}/${f.file}`),
      type: f.type,
      runId,
      engagementId,
      llm,
    })
    const sourceId = `s${i + 1}`
    const u = segment(raw, engagementId, sourceId)
    units.push(...u)
    sources.push({
      id: sourceId,
      engagementId,
      type: f.type,
      name: f.file,
      bytes: 0,
      status: 'READY',
      meta: raw.meta,
      rawText: raw.text,
      createdAt: '',
    })
    console.log(`  ${f.file.padEnd(42)} ${String(u.length).padStart(3)} units  (${f.type})`)
  }

  const corpus = new Corpus(units)
  console.log(`  → ${corpus.size} evidence units from ${sources.length} sources\n`)

  console.log('EXTRACT')
  const { signals } = await extractSignals({
    sources,
    corpus,
    llm,
    runId,
    engagementId,
    onEvent: (e) => {
      if (e.t === 'progress') console.log(`  [${e.done}/${e.total}] ${e.label}`)
      if (e.t === 'attempt') console.log(`  ↻ retry ${e.attempt}: ${e.because}`)
    },
  })
  const byType = signals.reduce<Record<string, number>>((a, s) => ({ ...a, [s.type]: (a[s.type] ?? 0) + 1 }), {})
  console.log(`  → ${signals.length} signals: ${Object.entries(byType).map(([k, n]) => `${k} ${n}`).join(', ')}\n`)

  console.log('RECONCILE')
  const { signals: merged, conflicts } = await reconcile({
    signals,
    corpus,
    llm,
    runId,
    engagementId,
    onEvent: (e) => {
      if (e.t === 'note') console.log(`  · ${e.text}`)
      if (e.t === 'progress') console.log(`  [${e.done}/${e.total}] ${e.label}`)
    },
  })
  const high = merged.filter((s) => s.confidence === 'HIGH').length
  console.log(`  → ${merged.length} distinct signals, ${high} at HIGH confidence\n`)

  console.log(`CONTRADICTIONS (${conflicts.length})`)
  for (const c of conflicts) {
    console.log(`\n  [${c.severity}] ${c.subject}`)
    console.log(`    A (${c.sideA.sourceLabel}): ${c.sideA.claim}`)
    console.log(`       "${c.sideA.quote.slice(0, 100)}"`)
    console.log(`    B (${c.sideB.sourceLabel}): ${c.sideB.claim}`)
    console.log(`       "${c.sideB.quote.slice(0, 100)}"`)
    console.log(`    ASK: ${c.resolutionQuestion}`)
  }

  // ---- did it find what we planted? ----------------------------------------
  const blob = JSON.stringify(conflicts).toLowerCase()
  const foundTimeline = /october/.test(blob) && /q1/.test(blob)
  const foundUsers = /forty|40/.test(blob) && /twelve|12/.test(blob)

  console.log('\n' + '─'.repeat(72))
  console.log(`  planted contradiction 1 (October vs Q1 go-live) : ${foundTimeline ? 'FOUND' : 'MISSED'}`)
  console.log(`  planted contradiction 2 (40 users vs 12 staff)  : ${foundUsers ? 'FOUND' : 'MISSED'}`)

  const cost = trace.reduce((a, t) => a + t.costUsd, 0)
  const pt = trace.reduce((a, t) => a + t.promptTokens, 0)
  const ct = trace.reduce((a, t) => a + t.completionTokens, 0)
  const retries = trace.filter((t) => t.attempt > 1).length
  console.log(
    `  ${trace.length} calls · ${pt.toLocaleString()} in + ${ct.toLocaleString()} out · ` +
      `$${cost.toFixed(4)} · ${((Date.now() - t0) / 1000).toFixed(1)}s · ${retries} retries`,
  )
  console.log('─'.repeat(72))

  process.exit(foundTimeline && foundUsers ? 0 : 1)
}

void main()
