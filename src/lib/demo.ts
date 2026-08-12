import { existsSync, readFileSync } from 'node:fs'
import { repo } from './db/repo'
import type { TraceEntry } from './llm/types'
import type { EvidenceUnit, Source } from './types'

/**
 * Loads a committed real pipeline run so the application is fully explorable
 * with no API key.
 *
 * A reviewer should be able to clone, install, run, and see every screen
 * populated before deciding whether to spend anything — and before deciding
 * whether the project is worth their time at all. The run is genuine output
 * from the Nordwind corpus, not hand-written fixtures, and the UI says so.
 */

const DEMO_PATH = 'fixtures/demo-run.json'

type DemoRun = {
  generatedAt: string
  engagementId: string
  sources: Source[]
  evidence: EvidenceUnit[]
  signals: unknown[]
  conflicts: unknown[]
  gaps: unknown
  brief: unknown
  blueprint: unknown
  appspec: unknown
  review: unknown
  trace: TraceEntry[]
}

let attempted = false

export function ensureDemoLoaded(): void {
  if (attempted) return
  attempted = true

  // Never overwrite real work. If the engagement already exists — because the
  // reviewer ran their own pipeline — the committed run stays on disk.
  if (repo.listEngagements().length > 0) return
  if (!existsSync(DEMO_PATH)) return

  try {
    const run = JSON.parse(readFileSync(DEMO_PATH, 'utf8')) as DemoRun

    repo.createEngagement('Quote-to-Booking Modernisation', 'Nordwind Logistics AS', run.engagementId)

    for (const s of run.sources) {
      // Evidence ids embed the source id they were built against
      // ("E-src_a1b2c3-014"), so a restored source keeps its original id.
      // Remapping them afterwards would work until two ids collided, and then
      // it would silently point citations at the wrong document.
      repo.addSource(run.engagementId, {
        forcedId: s.id,
        type: s.type,
        name: s.name,
        bytes: s.bytes,
        status: s.status,
        meta: s.meta,
        rawText: s.rawText,
      })
    }

    repo.putEvidence(run.evidence.map((u) => ({ ...u, engagementId: run.engagementId })))
    repo.saveArtifact(run.engagementId, 'signals', 'demo', run.signals)
    repo.saveArtifact(run.engagementId, 'reconciled', 'demo', {
      signals: run.signals,
      conflicts: run.conflicts,
    })
    repo.saveArtifact(run.engagementId, 'gaps', 'demo', run.gaps)
    repo.saveArtifact(run.engagementId, 'brief', 'demo', run.brief)
    repo.saveArtifact(run.engagementId, 'blueprint', 'demo', run.blueprint)
    repo.saveArtifact(run.engagementId, 'appspec', 'demo', run.appspec)
    repo.saveArtifact(run.engagementId, 'review', 'demo', run.review)
    for (const t of run.trace) repo.appendTrace({ ...t, engagementId: run.engagementId })

    const runId = repo.startRun(run.engagementId)
    repo.finishRun(runId, 'DONE', (run.review as { needsHumanReview?: string[] })?.needsHumanReview ?? [])
  } catch {
    // A malformed demo file must not stop the app booting. The reviewer gets an
    // empty workspace and can run their own engagement.
  }
}

export function demoGeneratedAt(): string | null {
  if (!existsSync(DEMO_PATH)) return null
  try {
    return (JSON.parse(readFileSync(DEMO_PATH, 'utf8')) as DemoRun).generatedAt
  } catch {
    return null
  }
}
