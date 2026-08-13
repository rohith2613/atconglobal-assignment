/**
 * Creates the Nordwind engagement, loads the sample corpus, and runs the full
 * pipeline over it.
 *
 *   npm run seed              create + run
 *   npm run seed -- --load    create and load sources, but do not run
 *   npm run seed -- --resume  keep whatever stages already completed, redo the rest
 *   npm run seed -- --export  after running, write fixtures/demo-run.json
 */
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'node:fs'
import { repo } from '../src/lib/db/repo'
import { runPipeline, loadEngagement, STAGE_LABEL } from '../src/lib/pipeline/run'
import type { SourceType } from '../src/lib/types'

const F = 'fixtures/nordwind'
export const NORDWIND_ID = 'eng_nordwind'

export const NORDWIND_SOURCES: { file: string; type: SourceType }[] = [
  { file: 'transcript-kickoff.txt', type: 'transcript' },
  { file: 'transcript-followup.txt', type: 'transcript' },
  { file: 'whatsapp-ops-group.txt', type: 'whatsapp' },
  { file: 'quotation-sop-v3.2.pdf', type: 'pdf' },
  { file: 'call-with-erik.mp3', type: 'audio' },
  { file: 'screen-1-nordquote-quotation-entry.png', type: 'screenshot' },
  { file: 'screen-2-carrier-rate-sheet.png', type: 'screenshot' },
  { file: 'screen-3-shared-quotes-mailbox.png', type: 'screenshot' },
  { file: 'website.html', type: 'website' },
]

export function createNordwind(): string {
  repo.deleteEngagement(NORDWIND_ID)
  repo.createEngagement('Quote-to-Booking Modernisation', 'Nordwind Logistics AS', NORDWIND_ID)
  return NORDWIND_ID
}

async function main() {
  const loadOnly = process.argv.includes('--load')
  const doExport = process.argv.includes('--export')
  const resume = process.argv.includes('--resume')
  const t0 = Date.now()

  if (!resume) createNordwind()
  else if (!repo.getEngagement(NORDWIND_ID)) createNordwind()

  console.log(
    `Engagement ${NORDWIND_ID} — Nordwind Logistics AS, ${NORDWIND_SOURCES.length} sources` +
      (resume ? ` (resuming; ${repo.listArtifactKinds(NORDWIND_ID).length} stages already saved)` : '') +
      '\n',
  )

  if (loadOnly) {
    for (const s of NORDWIND_SOURCES) {
      repo.addSource(NORDWIND_ID, {
        type: s.type,
        name: s.file,
        bytes: readFileSync(`${F}/${s.file}`).length,
        status: 'PENDING',
      })
    }
    console.log('Sources loaded. Run the pipeline from the UI.')
    return
  }

  await runPipeline({
    engagementId: NORDWIND_ID,
    resume,
    // On a resume the sources are already registered and read; re-adding them
    // would duplicate every evidence unit and break the ids citations point at.
    inputs: resume
      ? []
      : NORDWIND_SOURCES.map((s) => ({ kind: 'path' as const, path: `${F}/${s.file}`, type: s.type })),
    onEvent: (e) => {
      if (e.t === 'stage' && e.status === 'START') console.log(`\n▸ ${STAGE_LABEL[e.stage]}`)
      if (e.t === 'stage' && e.status === 'FAIL') console.log(`  ✗ ${e.detail}`)
      if (e.t === 'progress') console.log(`  [${e.done}/${e.total}] ${e.label}`)
      if (e.t === 'note') console.log(`  · ${e.text}`)
      if (e.t === 'attempt') console.log(`  ↻ attempt ${e.attempt + 1}: ${e.because}`)
      if (e.t === 'error') console.log(`  ERROR ${e.message}`)
    },
  })

  const d = loadEngagement(NORDWIND_ID)
  const cost = d.trace.reduce((a, t) => a + t.costUsd, 0)
  const pt = d.trace.reduce((a, t) => a + t.promptTokens, 0)
  const ct = d.trace.reduce((a, t) => a + t.completionTokens, 0)
  const gapsMissing = d.gaps.filter((g) => g.status === 'MISSING').length
  const gapsPartial = d.gaps.filter((g) => g.status === 'PARTIAL').length

  console.log('\n' + '═'.repeat(74))
  console.log(`  evidence units      ${d.evidence.length}`)
  console.log(`  signals             ${d.signals.length}`)
  console.log(`  contradictions      ${d.conflicts.length}`)
  console.log(`  coverage            ${30 - gapsMissing - gapsPartial} covered, ${gapsPartial} partial, ${gapsMissing} missing`)
  console.log(`  pain points         ${d.brief?.painPoints.length ?? 0}`)
  console.log(`  requirements        ${d.brief?.requirements.length ?? 0}`)
  console.log(`  open questions      ${d.brief?.openQuestions.length ?? 0}`)
  console.log(`  features            ${d.blueprint?.features.length ?? 0}`)
  console.log(`  POC screens         ${d.appspec?.screens.length ?? 0} (${d.appspec?.appName ?? '—'})`)
  console.log(`  needs human review  ${d.review?.needsHumanReview.join(', ') || 'nothing'}`)
  console.log(
    `  ${d.trace.length} calls · ${pt.toLocaleString()} in + ${ct.toLocaleString()} out · ` +
      `$${cost.toFixed(4)} · ${((Date.now() - t0) / 1000).toFixed(0)}s · ${d.trace.filter((t) => t.attempt > 1).length} retries`,
  )
  console.log('═'.repeat(74))

  if (doExport) {
    writeFileSync(
      'fixtures/demo-run.json',
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          engagementId: NORDWIND_ID,
          note: 'A real pipeline run over the Nordwind corpus, committed so the app is fully explorable with no API key.',
          sources: d.sources,
          evidence: d.evidence,
          signals: d.signals,
          conflicts: d.conflicts,
          gaps: d.gaps,
          brief: d.brief,
          blueprint: d.blueprint,
          appspec: d.appspec,
          review: d.review,
          trace: d.trace,
        },
        null,
        2,
      ),
    )
    console.log('\nWrote fixtures/demo-run.json')
  }
}

void main()
