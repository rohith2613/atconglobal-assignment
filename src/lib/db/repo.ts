import { randomUUID } from 'node:crypto'
import type { TraceEntry } from '../llm/types'
import type {
  ArtifactKind,
  ClaimOverride,
  ClaimStatus,
  Engagement,
  EvidenceUnit,
  RunRecord,
  RunStatus,
  Source,
  SourceStatus,
  SourceType,
} from '../types'
import { getDb } from './client'

export { resetDbForTests, closeDb } from './client'

const now = () => new Date().toISOString()
const id = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`

type EngagementRow = { id: string; name: string; client: string; created_at: string }
type SourceRow = {
  id: string
  engagement_id: string
  type: string
  name: string
  bytes: number
  status: string
  error: string | null
  meta_json: string
  raw_text: string
  created_at: string
}
type EvidenceRow = {
  id: string
  engagement_id: string
  source_id: string
  source_type: string
  locator: string
  text: string
  char_start: number
  char_end: number
  ordinal: number
}
type TraceRow = {
  id: string
  engagement_id: string
  run_id: string
  stage: string
  role: string
  model: string
  prompt_tokens: number
  completion_tokens: number
  cost_usd: number
  latency_ms: number
  attempt: number
  ok: number
  error: string | null
  summary: string
  created_at: string
}
type RunRow = {
  id: string
  engagement_id: string
  status: string
  started_at: string
  finished_at: string | null
  error: string | null
  review_json: string
}

const toEngagement = (r: EngagementRow): Engagement => ({
  id: r.id,
  name: r.name,
  client: r.client,
  createdAt: r.created_at,
})

const toSource = (r: SourceRow): Source => ({
  id: r.id,
  engagementId: r.engagement_id,
  type: r.type as SourceType,
  name: r.name,
  bytes: r.bytes,
  status: r.status as SourceStatus,
  error: r.error ?? undefined,
  meta: JSON.parse(r.meta_json) as Record<string, string | number>,
  rawText: r.raw_text,
  createdAt: r.created_at,
})

const toEvidence = (r: EvidenceRow): EvidenceUnit => ({
  id: r.id,
  engagementId: r.engagement_id,
  sourceId: r.source_id,
  sourceType: r.source_type as SourceType,
  locator: r.locator,
  text: r.text,
  charStart: r.char_start,
  charEnd: r.char_end,
  ordinal: r.ordinal,
})

const toTrace = (r: TraceRow): TraceEntry => ({
  id: r.id,
  engagementId: r.engagement_id,
  runId: r.run_id,
  stage: r.stage,
  role: r.role as TraceEntry['role'],
  model: r.model,
  promptTokens: r.prompt_tokens,
  completionTokens: r.completion_tokens,
  costUsd: r.cost_usd,
  latencyMs: r.latency_ms,
  attempt: r.attempt,
  ok: r.ok === 1,
  error: r.error ?? undefined,
  summary: r.summary,
  createdAt: r.created_at,
})

const toRun = (r: RunRow): RunRecord => ({
  id: r.id,
  engagementId: r.engagement_id,
  status: r.status as RunStatus,
  startedAt: r.started_at,
  finishedAt: r.finished_at ?? undefined,
  error: r.error ?? undefined,
  needsHumanReview: JSON.parse(r.review_json) as string[],
})

export const repo = {
  // ---- engagements ---------------------------------------------------------

  createEngagement(name: string, client: string, forcedId?: string): string {
    const eid = forcedId ?? id('eng')
    getDb()
      .prepare('INSERT INTO engagements (id, name, client, created_at) VALUES (?, ?, ?, ?)')
      .run(eid, name, client, now())
    return eid
  },

  listEngagements(): Engagement[] {
    return (
      getDb().prepare('SELECT * FROM engagements ORDER BY created_at DESC').all() as EngagementRow[]
    ).map(toEngagement)
  },

  getEngagement(eid: string): Engagement | undefined {
    const r = getDb().prepare('SELECT * FROM engagements WHERE id = ?').get(eid) as
      | EngagementRow
      | undefined
    return r ? toEngagement(r) : undefined
  },

  deleteEngagement(eid: string): void {
    getDb().prepare('DELETE FROM engagements WHERE id = ?').run(eid)
  },

  // ---- sources -------------------------------------------------------------

  addSource(
    engagementId: string,
    s: {
      type: SourceType
      name: string
      bytes?: number
      status?: SourceStatus
      meta?: Record<string, string | number>
      rawText?: string
    },
  ): string {
    const sid = id('src')
    getDb()
      .prepare(
        `INSERT INTO sources (id, engagement_id, type, name, bytes, status, meta_json, raw_text, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        sid,
        engagementId,
        s.type,
        s.name,
        s.bytes ?? 0,
        s.status ?? 'PENDING',
        JSON.stringify(s.meta ?? {}),
        s.rawText ?? '',
        now(),
      )
    return sid
  },

  updateSource(
    sid: string,
    patch: {
      status?: SourceStatus
      error?: string | null
      meta?: Record<string, string | number>
      rawText?: string
    },
  ): void {
    const sets: string[] = []
    const vals: unknown[] = []
    if (patch.status !== undefined) (sets.push('status = ?'), vals.push(patch.status))
    if (patch.error !== undefined) (sets.push('error = ?'), vals.push(patch.error))
    if (patch.meta !== undefined) (sets.push('meta_json = ?'), vals.push(JSON.stringify(patch.meta)))
    if (patch.rawText !== undefined) (sets.push('raw_text = ?'), vals.push(patch.rawText))
    if (sets.length === 0) return
    vals.push(sid)
    getDb()
      .prepare(`UPDATE sources SET ${sets.join(', ')} WHERE id = ?`)
      .run(...(vals as never[]))
  },

  listSources(engagementId: string): Source[] {
    return (
      getDb()
        .prepare('SELECT * FROM sources WHERE engagement_id = ? ORDER BY created_at')
        .all(engagementId) as SourceRow[]
    ).map(toSource)
  },

  getSource(sid: string): Source | undefined {
    const r = getDb().prepare('SELECT * FROM sources WHERE id = ?').get(sid) as SourceRow | undefined
    return r ? toSource(r) : undefined
  },

  // ---- evidence ------------------------------------------------------------

  putEvidence(units: EvidenceUnit[]): void {
    if (units.length === 0) return
    const stmt = getDb().prepare(
      `INSERT OR REPLACE INTO evidence
         (id, engagement_id, source_id, source_type, locator, text, char_start, char_end, ordinal)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const tx = getDb().transaction((rows: EvidenceUnit[]) => {
      for (const u of rows) {
        stmt.run(
          u.id,
          u.engagementId,
          u.sourceId,
          u.sourceType,
          u.locator,
          u.text,
          u.charStart,
          u.charEnd,
          u.ordinal,
        )
      }
    })
    tx(units)
  },

  getEvidence(engagementId: string): EvidenceUnit[] {
    return (
      getDb()
        .prepare('SELECT * FROM evidence WHERE engagement_id = ? ORDER BY ordinal')
        .all(engagementId) as EvidenceRow[]
    ).map(toEvidence)
  },

  getEvidenceBySource(sourceId: string): EvidenceUnit[] {
    return (
      getDb()
        .prepare('SELECT * FROM evidence WHERE source_id = ? ORDER BY ordinal')
        .all(sourceId) as EvidenceRow[]
    ).map(toEvidence)
  },

  getEvidenceById(eid: string): EvidenceUnit | undefined {
    const r = getDb().prepare('SELECT * FROM evidence WHERE id = ?').get(eid) as
      | EvidenceRow
      | undefined
    return r ? toEvidence(r) : undefined
  },

  clearEvidence(engagementId: string): void {
    getDb().prepare('DELETE FROM evidence WHERE engagement_id = ?').run(engagementId)
  },

  // ---- artifacts -----------------------------------------------------------

  /** One artifact per (engagement, kind). A re-run replaces, never accumulates. */
  saveArtifact(engagementId: string, kind: ArtifactKind, runId: string, json: unknown): void {
    getDb()
      .prepare(
        `INSERT INTO artifacts (engagement_id, kind, run_id, json, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(engagement_id, kind)
         DO UPDATE SET run_id = excluded.run_id, json = excluded.json, created_at = excluded.created_at`,
      )
      .run(engagementId, kind, runId, JSON.stringify(json), now())
  },

  getArtifact<T>(engagementId: string, kind: ArtifactKind): T | undefined {
    const r = getDb()
      .prepare('SELECT json FROM artifacts WHERE engagement_id = ? AND kind = ?')
      .get(engagementId, kind) as { json: string } | undefined
    return r ? (JSON.parse(r.json) as T) : undefined
  },

  listArtifactKinds(engagementId: string): ArtifactKind[] {
    return (
      getDb()
        .prepare('SELECT kind FROM artifacts WHERE engagement_id = ?')
        .all(engagementId) as { kind: string }[]
    ).map((r) => r.kind as ArtifactKind)
  },

  // ---- trace ---------------------------------------------------------------

  appendTrace(e: TraceEntry): void {
    getDb()
      .prepare(
        `INSERT OR REPLACE INTO trace
           (id, engagement_id, run_id, stage, role, model, prompt_tokens, completion_tokens,
            cost_usd, latency_ms, attempt, ok, error, summary, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        e.id,
        e.engagementId,
        e.runId,
        e.stage,
        e.role,
        e.model,
        e.promptTokens,
        e.completionTokens,
        e.costUsd,
        e.latencyMs,
        e.attempt,
        e.ok ? 1 : 0,
        e.error ?? null,
        e.summary,
        e.createdAt,
      )
  },

  getTrace(engagementId: string): TraceEntry[] {
    return (
      getDb()
        .prepare('SELECT * FROM trace WHERE engagement_id = ? ORDER BY created_at, id')
        .all(engagementId) as TraceRow[]
    ).map(toTrace)
  },

  clearTrace(engagementId: string): void {
    getDb().prepare('DELETE FROM trace WHERE engagement_id = ?').run(engagementId)
  },

  // ---- runs ----------------------------------------------------------------

  startRun(engagementId: string): string {
    const rid = id('run')
    getDb()
      .prepare(
        `INSERT INTO runs (id, engagement_id, status, started_at, review_json)
         VALUES (?, ?, 'RUNNING', ?, '[]')`,
      )
      .run(rid, engagementId, now())
    return rid
  },

  finishRun(runId: string, status: RunStatus, needsHumanReview: string[], error?: string): void {
    getDb()
      .prepare('UPDATE runs SET status = ?, finished_at = ?, review_json = ?, error = ? WHERE id = ?')
      .run(status, now(), JSON.stringify(needsHumanReview), error ?? null, runId)
  },

  latestRun(engagementId: string): RunRecord | undefined {
    const r = getDb()
      .prepare('SELECT * FROM runs WHERE engagement_id = ? ORDER BY started_at DESC LIMIT 1')
      .get(engagementId) as RunRow | undefined
    return r ? toRun(r) : undefined
  },

  // ---- claim overrides -----------------------------------------------------

  /**
   * Consultant judgement on an individual AI claim. Stored apart from the
   * artifacts so re-running the pipeline cannot silently discard it.
   */
  setClaimStatus(engagementId: string, claimId: string, status: ClaimStatus, text?: string): void {
    getDb()
      .prepare(
        `INSERT INTO claim_overrides (claim_id, engagement_id, status, text, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(engagement_id, claim_id)
         DO UPDATE SET status = excluded.status, text = excluded.text, updated_at = excluded.updated_at`,
      )
      .run(claimId, engagementId, status, text ?? null, now())
  },

  clearClaimStatus(engagementId: string, claimId: string): void {
    getDb()
      .prepare('DELETE FROM claim_overrides WHERE engagement_id = ? AND claim_id = ?')
      .run(engagementId, claimId)
  },

  getClaimOverrides(engagementId: string): Record<string, ClaimOverride> {
    const rows = getDb()
      .prepare('SELECT * FROM claim_overrides WHERE engagement_id = ?')
      .all(engagementId) as {
      claim_id: string
      engagement_id: string
      status: string
      text: string | null
      updated_at: string
    }[]
    const out: Record<string, ClaimOverride> = {}
    for (const r of rows) {
      out[r.claim_id] = {
        claimId: r.claim_id,
        engagementId: r.engagement_id,
        status: r.status as ClaimStatus,
        text: r.text ?? undefined,
        updatedAt: r.updated_at,
      }
    }
    return out
  },
}
