/**
 * Exercises the two ingest paths that need a model: Whisper on the call
 * recording and vision on a legacy screenshot. Run: npx tsx scripts/smoke-ingest.ts
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { getLlm } from '../src/lib/llm'
import { parseAudio } from '../src/lib/ingest/audio'
import { parseScreenshot } from '../src/lib/ingest/screenshot'
import { segment, Corpus } from '../src/lib/evidence'

const ctx = { runId: 'smoke', engagementId: 'smoke' }

async function main() {
  const llm = getLlm()

  console.log('— whisper-1 on fixtures/nordwind/call-with-erik.mp3')
  const audio = await parseAudio(
    'call-with-erik.mp3',
    readFileSync('fixtures/nordwind/call-with-erik.mp3'),
    llm,
    ctx,
  )
  console.log(`  ${audio.segments.length} passages, ${audio.meta.durationSeconds}s`)
  console.log(`  first:  [${audio.segments[0].locator}] ${audio.segments[0].text.slice(0, 110)}…`)
  const hits = ['Winfreight', 'Marta', 'dangerous goods', 'two hours'].filter((k) =>
    audio.text.toLowerCase().includes(k.toLowerCase()),
  )
  console.log(`  recovered key terms: ${hits.join(', ') || 'NONE — transcription may be poor'}`)

  console.log('\n— vision on fixtures/nordwind/screen-3-shared-quotes-mailbox.png')
  const shot = await parseScreenshot(
    'screen-3-shared-quotes-mailbox.png',
    readFileSync('fixtures/nordwind/screen-3-shared-quotes-mailbox.png'),
    'image/png',
    llm,
    ctx,
  )
  console.log(`  screen read as: ${shot.meta.screenName}`)
  console.log(`  ${shot.meta.frictionSignals} friction signals, ${shot.segments.length} units`)
  for (const s of shot.segments.filter((x) => x.locator.includes('workflow')).slice(0, 3)) {
    console.log(`    obs · ${s.text.slice(0, 130)}`)
  }
  for (const s of shot.segments.filter((x) => x.locator.includes('friction')).slice(0, 6)) {
    console.log(`    ⚠   ${s.text.slice(0, 130)}`)
  }

  const corpus = new Corpus([
    ...segment(audio, 'e', 'sa'),
    ...segment(shot, 'e', 'sb'),
  ])
  console.log(`\n  combined into ${corpus.size} citable evidence units`)
}

void main()
