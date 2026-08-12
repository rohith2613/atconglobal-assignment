import { readFileSync } from 'node:fs'
import { config } from '../config'
import { repo } from '../db/repo'
import { Corpus, segment } from '../evidence'
import { ingest, ingestUrl } from '../ingest'
import { getLlm } from '../llm'
import type { AppSpec } from '../schema/appspec'
import type { Blueprint } from '../schema/blueprint'
import type { Brief } from '../schema/brief'
import type { GapRow } from '../schema/gaps'
import type { Conflict, Signal } from '../schema/signals'
import type { Violation } from '../verify/types'
import { buildBlueprint } from './blueprint'
import { STAGES, type EventFn, type RunEvent, type Stage } from './events'
import { extractSignals } from './extract'
import { analyseGaps } from './gaps'
import { generateAppSpec } from './poc'
import { reconcile } from './reconcile'
import { synthesiseBrief } from './synthesize'

export * from './events'
export { coverageScore, coverageByDimension, clientQuestionList } from './gaps'
export { asIsDiagram, toBeDiagram, toMermaid, traceabilityMatrix } from './blueprint'
export { extractEntities } from './poc'

export type ReconciledArtifact = { signals: Signal[]; conflicts: Conflict[] }

/**
 * Serialises a RunEvent as one SSE frame.
 *
 * JSON.stringify escapes the newlines for us, which matters more than it looks:
 * a raw newline inside a payload silently ends the frame and the client sees a
 * truncated event rather than an error.
 */
export function encodeSse(e: RunEvent): string {
  return `data: ${JSON.stringify(e)}\n\n`
}

// ---------------------------------------------------------------------------
// In-process event bus. One live run per engagement; the SSE route subscribes.
// ---------------------------------------------------------------------------

type Bus = { events: RunEvent[]; subscribers: Set<EventFn>; finished: boolean }
const buses = new Map<string, Bus>()

export function busFor(engagementId: string): Bus {
  let b = buses.get(engagementId)
  if (!b) {
    b = { events: [], subscribers: new Set(), finished: false }
    buses.set(engagementId, b)
  }
  return b
}

/**
 * Subscribers receive the backlog first.
 *
 * The client POSTs /run and then opens the stream, so without a replay the
 * first two or three stage events are always lost and the UI opens on a
 * pipeline that appears to have started at "extract".
 */
export function subscribe(engagementId: string, fn: EventFn): () => void {
  const bus = busFor(engagementId)
  for (const e of bus.events) fn(e)
  bus.subscribers.add(fn)
  return () => bus.subscribers.delete(fn)
}

export const isRunning = (engagementId: string) => {
  const b = buses.get(engagementId)
  return Boolean(b && !b.finished)
}

function publish(engagementId: string, e: RunEvent): void {
  const bus = busFor(engagementId)
  bus.events.push(e)
  if (e.t === 'done' || e.t === 'error') bus.finished = true
  for (const fn of bus.subscribers) {
    try {
      fn(e)
    } catch {
      // A dead subscriber must never take the pipeline down with it.
    }
  }
}

// ---------------------------------------------------------------------------

export type SourceInput =
  | { kind: 'file'; filename: string; buffer: Buffer; type?: import('../types').SourceType }
  | { kind: 'path'; path: string; filename?: string; type?: import('../types').SourceType }

/**
 * Runs the full pipeline.
 *
 * Each stage persists its artifact before the next begins. That is not
 * belt-and-braces: the run takes minutes, and a failure at "poc" that discarded
 * the brief would mean paying for the whole thing again to recover work that
 * was already correct.
 */
export async function runPipeline(args: {
  engagementId: string
  inputs?: SourceInput[]
  onEvent?: EventFn
}): Promise<{ runId: string; needsHumanReview: string[] }> {
  const { engagementId } = args
  const runId = repo.startRun(engagementId)

  const bus = busFor(engagementId)
  bus.events = []
  bus.finished = false

  const emit: EventFn = (e) => {
    args.onEvent?.(e)
    publish(engagementId, e)
  }

  const llm = getLlm((entry) => {
    repo.appendTrace(entry)
    emit({ t: 'trace', entry })
  })

  const needsHumanReview: string[] = []
  const stage = <T>(s: Stage, fn: () => Promise<T>) => runStage(s, fn, emit)

  try {
    repo.clearTrace(engagementId)

    // ---- ingest + segment --------------------------------------------------

    await stage('ingest', async () => {
      // Two entry points converge here. Scripts pass `inputs` directly; the UI
      // has already uploaded and registered rows as PENDING. Both become source
      // rows first, then a single loop reads them, so the two paths cannot
      // drift apart.
      for (const input of args.inputs ?? []) {
        const filename =
          input.kind === 'file' ? input.filename : (input.filename ?? input.path.split(/[\\/]/).pop()!)
        const buffer = input.kind === 'file' ? input.buffer : readFileSync(input.path)
        repo.addSource(engagementId, {
          type: input.type ?? 'notes',
          name: filename,
          bytes: buffer.length,
          status: 'PENDING',
          meta: { stagedBase64: buffer.toString('base64') },
        })
      }

      const pending = repo.listSources(engagementId).filter((s) => s.status === 'PENDING')
      let done = 0

      for (const source of pending) {
        try {
          const raw = await readSource(source, { runId, engagementId, llm })
          repo.putEvidence(segment(raw, engagementId, source.id))
          // The staged bytes are dropped once read. Keeping a base64 copy of
          // every upload in the row would bloat the database for no purpose.
          repo.updateSource(source.id, {
            status: 'READY',
            rawText: raw.text,
            meta: { ...raw.meta, detectedType: raw.type },
            error: null,
          })
        } catch (err) {
          // One unreadable file must not cost the whole engagement. It is
          // recorded as FAILED, reported, and the run continues without it.
          const message = err instanceof Error ? err.message : String(err)
          repo.updateSource(source.id, { status: 'FAILED', error: message })
          emit({ t: 'note', stage: 'ingest', text: `could not read ${source.name} — ${message}` })
        }

        done += 1
        emit({ t: 'progress', stage: 'ingest', done, total: pending.length, label: source.name })
      }
    })

    const sources = repo.listSources(engagementId).filter((s) => s.status === 'READY')
    const corpus = new Corpus(repo.getEvidence(engagementId))

    await stage('segment', async () => {
      emit({
        t: 'note',
        stage: 'segment',
        text: `${corpus.size} citable evidence units from ${sources.length} sources`,
      })
    })

    if (corpus.size === 0) throw new Error('No readable sources. Nothing to analyse.')

    // ---- extract -----------------------------------------------------------

    const { signals: raw, needsHumanReview: extractFlagged } = await stage('extract', () =>
      extractSignals({ sources, corpus, llm, runId, engagementId, onEvent: emit }),
    )
    if (extractFlagged) needsHumanReview.push('extract')
    repo.saveArtifact(engagementId, 'signals', runId, raw)

    // ---- reconcile ---------------------------------------------------------

    const reconciled = await stage('reconcile', () =>
      reconcile({ signals: raw, corpus, llm, runId, engagementId, onEvent: emit }),
    )
    repo.saveArtifact(engagementId, 'reconciled', runId, reconciled)

    // ---- gaps --------------------------------------------------------------

    const gaps = await stage('gaps', () =>
      analyseGaps({ signals: reconciled.signals, corpus, llm, runId, engagementId, onEvent: emit }),
    )
    repo.saveArtifact(engagementId, 'gaps', runId, gaps)

    // ---- synthesize --------------------------------------------------------

    const brief = await stage('synthesize', () =>
      synthesiseBrief({
        signals: reconciled.signals,
        conflicts: reconciled.conflicts,
        gaps,
        corpus,
        llm,
        runId,
        engagementId,
        onEvent: emit,
      }),
    )
    if (brief.needsHumanReview) needsHumanReview.push('synthesize')
    repo.saveArtifact(engagementId, 'brief', runId, brief.brief)

    // ---- blueprint ---------------------------------------------------------

    const blueprint = await stage('blueprint', () =>
      buildBlueprint({ brief: brief.brief, gaps, llm, runId, engagementId, onEvent: emit }),
    )
    if (blueprint.needsHumanReview) needsHumanReview.push('blueprint')
    repo.saveArtifact(engagementId, 'blueprint', runId, blueprint.blueprint)

    // ---- poc ---------------------------------------------------------------

    const poc = await stage('poc', () =>
      generateAppSpec({
        brief: brief.brief,
        blueprint: blueprint.blueprint,
        corpus,
        llm,
        runId,
        engagementId,
        onEvent: emit,
      }),
    )
    if (poc.needsHumanReview) needsHumanReview.push('poc')
    repo.saveArtifact(engagementId, 'appspec', runId, poc.spec)

    // Surviving violations are kept so the UI can show what the loop could not
    // fix, rather than presenting a flawed output as clean.
    repo.saveArtifact(engagementId, 'review', runId, {
      needsHumanReview,
      violations: [...brief.violations, ...blueprint.violations, ...poc.violations] satisfies Violation[],
    })

    repo.finishRun(runId, 'DONE', needsHumanReview)
    emit({ t: 'done', runId, needsHumanReview })
    return { runId, needsHumanReview }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    repo.finishRun(runId, 'FAILED', needsHumanReview, message)
    emit({ t: 'error', message })
    throw err
  }
}

/** Turns a registered PENDING source row back into readable bytes, then parses it. */
async function readSource(
  source: import('../types').Source,
  ctx: { runId: string; engagementId: string; llm: ReturnType<typeof getLlm> },
) {
  const url = source.meta.url
  if (source.type === 'website' && typeof url === 'string') {
    return ingestUrl(url)
  }

  const staged = source.meta.stagedBase64
  if (typeof staged === 'string' && staged.length > 0) {
    return ingest({
      filename: source.name,
      buffer: Buffer.from(staged, 'base64'),
      type: source.type,
      ...ctx,
    })
  }

  throw new Error('the uploaded content is no longer available; re-add the source')
}

async function runStage<T>(s: Stage, fn: () => Promise<T>, emit: EventFn): Promise<T> {
  emit({ t: 'stage', stage: s, status: 'START' })
  try {
    const out = await fn()
    emit({ t: 'stage', stage: s, status: 'DONE' })
    return out
  } catch (err) {
    emit({
      t: 'stage',
      stage: s,
      status: 'FAIL',
      detail: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}

// ---------------------------------------------------------------------------

/** Everything the UI needs for one engagement, read back from storage. */
export function loadEngagement(engagementId: string) {
  const reconciled = repo.getArtifact<ReconciledArtifact>(engagementId, 'reconciled')
  return {
    engagement: repo.getEngagement(engagementId),
    sources: repo.listSources(engagementId),
    evidence: repo.getEvidence(engagementId),
    signals: reconciled?.signals ?? repo.getArtifact<Signal[]>(engagementId, 'signals') ?? [],
    conflicts: reconciled?.conflicts ?? [],
    gaps: repo.getArtifact<GapRow[]>(engagementId, 'gaps') ?? [],
    brief: repo.getArtifact<Brief>(engagementId, 'brief'),
    blueprint: repo.getArtifact<Blueprint>(engagementId, 'blueprint'),
    appspec: repo.getArtifact<AppSpec>(engagementId, 'appspec'),
    review: repo.getArtifact<{ needsHumanReview: string[]; violations: Violation[] }>(engagementId, 'review'),
    trace: repo.getTrace(engagementId),
    run: repo.latestRun(engagementId),
    overrides: repo.getClaimOverrides(engagementId),
    hasKey: config.hasKey,
  }
}

export type EngagementData = ReturnType<typeof loadEngagement>
export { STAGES }
