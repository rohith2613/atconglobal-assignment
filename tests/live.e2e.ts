/**
 * End-to-end over the real corpus, against the real API.
 *
 * Separate from the offline suite because it needs a key and costs money. What
 * it asserts is not "the pipeline ran" but "the pipeline found the things the
 * corpus was built to contain" — the planted contradictions and the planted
 * gaps. A run that completes cleanly while missing both is a failure.
 *
 *   npm run test:live
 *   npm run test:live -- --resume     reuse stages already saved
 */
import 'dotenv/config'
import { config } from '../src/lib/config'
import { repo } from '../src/lib/db/repo'
import { loadEngagement, runPipeline } from '../src/lib/pipeline/run'
import { createNordwind, NORDWIND_ID, NORDWIND_SOURCES } from '../scripts/seed'

const F = 'fixtures/nordwind'
const resume = process.argv.includes('--resume')

let failures = 0

function check(name: string, pass: boolean, detail = '') {
  console.log(`${pass ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!pass) failures += 1
}

async function main() {
  if (!config.hasKey) {
    console.error('No API key configured. This suite talks to the real API; set OPENAI_API_KEY in .env.')
    process.exit(1)
  }

  const t0 = Date.now()

  if (!resume || !repo.getEngagement(NORDWIND_ID)) createNordwind()

  console.log(`Running the full pipeline over the Nordwind corpus${resume ? ' (resuming)' : ''}…\n`)

  await runPipeline({
    engagementId: NORDWIND_ID,
    resume,
    inputs: resume
      ? []
      : NORDWIND_SOURCES.map((s) => ({ kind: 'path' as const, path: `${F}/${s.file}`, type: s.type })),
    onEvent: (e) => {
      if (e.t === 'stage' && e.status === 'START') process.stdout.write(`  ${e.stage}…\n`)
      if (e.t === 'stage' && e.status === 'FAIL') process.stdout.write(`  ${e.stage} FAILED: ${e.detail}\n`)
    },
  })

  const d = loadEngagement(NORDWIND_ID)
  const blob = JSON.stringify(d.conflicts).toLowerCase()

  console.log('\nIngest and evidence')
  check('all nine sources were read', d.sources.filter((s) => s.status === 'READY').length === 9, `${d.sources.filter((s) => s.status === 'READY').length}/9`)
  check('six distinct source types', new Set(d.sources.map((s) => s.type)).size === 6)
  check('the audio was transcribed', d.evidence.some((u) => u.sourceType === 'audio'), `${d.evidence.filter((u) => u.sourceType === 'audio').length} passages`)
  check('the screenshots were read', d.evidence.some((u) => u.sourceType === 'screenshot'))
  check('enough citable evidence to reason over', d.evidence.length > 150, `${d.evidence.length} units`)

  console.log('\nExtraction')
  check('signals were extracted', d.signals.length > 80, `${d.signals.length} signals`)
  check(
    'every signal cites evidence that exists',
    d.signals.every((s) => s.citation.evidenceIds.every((id) => d.evidence.some((u) => u.id === id))),
  )
  check('confidence discriminates rather than rating everything HIGH', new Set(d.signals.map((s) => s.confidence)).size > 1)

  console.log('\nThe planted contradictions')
  check('the October vs Q1 go-live contradiction was found', /october/.test(blob) && /q1/.test(blob))
  check('the 40 users vs 12 staff contradiction was found', /forty|\b40\b/.test(blob) && /twelve|\b12\b/.test(blob))
  check(
    'every reported contradiction quotes evidence that exists',
    d.conflicts.every((c) =>
      [...c.sideA.evidenceIds, ...c.sideB.evidenceIds].every((id) => d.evidence.some((u) => u.id === id)),
    ),
  )
  check('each one asks a client-ready question', d.conflicts.every((c) => c.resolutionQuestion.length > 40))

  console.log('\nThe planted gaps')
  const unanswered = (qid: string) => d.gaps.find((g) => g.questionId === qid)?.status !== 'COVERED'
  check('CO1 data residency is not covered', unanswered('CO1'))
  check('NF2 authentication is not covered', unanswered('NF2'))
  check('IN2 the Winfreight interface is not covered', unanswered('IN2'))
  check('CM2 the cost of the current process is not covered', unanswered('CM2'))
  check('all 30 checklist questions were scored', d.gaps.length === 30, `${d.gaps.length}/30`)
  check('every unanswered question produced a client question', d.gaps.filter((g) => g.status !== 'COVERED').every((g) => Boolean(g.clientQuestion)))

  console.log('\nThe brief')
  check('a brief was produced', Boolean(d.brief))
  check('it has requirements', (d.brief?.requirements.length ?? 0) >= 4, `${d.brief?.requirements.length}`)
  check('it has pain points', (d.brief?.painPoints.length ?? 0) >= 3, `${d.brief?.painPoints.length}`)
  check(
    'every contradiction raised an open question',
    d.conflicts.every((c) => d.brief?.openQuestions.some((q) => q.raisedByConflictId === c.id)),
  )

  console.log('\nThe proposal')
  check('a blueprint was produced', Boolean(d.blueprint))
  check(
    'every feature traces to a real requirement',
    (d.blueprint?.features ?? []).every((f) =>
      f.requirementIds.some((r) => d.brief?.requirements.some((x) => x.id === r)),
    ),
  )
  check(
    'every HIGH-impact pain point is resolved by a step',
    (d.brief?.painPoints ?? [])
      .filter((p) => p.impact === 'HIGH')
      .every((p) => (d.blueprint?.toBeProcess ?? []).some((s) => s.resolvesPainIds.includes(p.id))),
  )

  console.log('\nThe prototype')
  check('an AppSpec was produced', Boolean(d.appspec))
  check('it has at least three screens', (d.appspec?.screens.length ?? 0) >= 3, `${d.appspec?.screens.length}`)
  check(
    'it is clickable — something navigates somewhere',
    (d.appspec?.screens ?? []).some((s) =>
      s.blocks.some(
        (b) =>
          (b.kind === 'table' && b.rowActionTarget) ||
          (b.kind === 'form' && b.submitTarget) ||
          (b.kind === 'detail' && b.actions.some((a) => a.target)),
      ),
    ),
  )
  check(
    'every navigation target exists',
    (d.appspec?.screens ?? []).every((s) =>
      s.blocks.every((b) => {
        const t = b.kind === 'table' ? b.rowActionTarget : b.kind === 'form' ? b.submitTarget : null
        return !t || d.appspec!.screens.some((x) => x.id === t)
      }),
    ),
  )
  check(
    'seed data uses the client vocabulary, not placeholders',
    !/lorem|acme|customer a\b|example corp/i.test(JSON.stringify(d.appspec)),
  )

  const cost = d.trace.reduce((a, t) => a + t.costUsd, 0)
  const retries = d.trace.filter((t) => t.attempt > 1).length

  console.log('\n' + '═'.repeat(70))
  console.log(
    `  ${d.trace.length} calls · $${cost.toFixed(4)} · ${((Date.now() - t0) / 1000).toFixed(0)}s · ` +
      `${retries} regenerations · flagged: ${d.review?.needsHumanReview.join(', ') || 'nothing'}`,
  )
  console.log(`  ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  console.log('═'.repeat(70))

  process.exit(failures === 0 ? 0 : 1)
}

void main()
