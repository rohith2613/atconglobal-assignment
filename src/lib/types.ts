/**
 * Domain types shared across the db, ingest and pipeline layers.
 * Kept in one leaf module so nothing below it has to import upward.
 */

export type SourceType =
  | 'transcript'
  | 'whatsapp'
  | 'pdf'
  | 'screenshot'
  | 'website'
  | 'audio'
  | 'notes'

export const SOURCE_TYPES: readonly SourceType[] = [
  'transcript',
  'whatsapp',
  'pdf',
  'screenshot',
  'website',
  'audio',
  'notes',
]

export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  transcript: 'Meeting transcript',
  whatsapp: 'WhatsApp export',
  pdf: 'PDF document',
  screenshot: 'Screenshot',
  website: 'Website reference',
  audio: 'Call recording',
  notes: 'Notes',
}

export type SourceStatus = 'PENDING' | 'READY' | 'FAILED'

export type Engagement = {
  id: string
  name: string
  client: string
  createdAt: string
}

export type Source = {
  id: string
  engagementId: string
  type: SourceType
  name: string
  bytes: number
  status: SourceStatus
  error?: string
  meta: Record<string, string | number>
  rawText: string
  createdAt: string
}

/**
 * The addressable unit of citation. Every claim the system makes points at one
 * or more of these by id, and a validator proves the id exists and the quoted
 * span is really in it. This type is the reason the whole design works.
 */
export type EvidenceUnit = {
  id: string
  engagementId: string
  sourceId: string
  sourceType: SourceType
  /** Human-meaningful position: "Priya Nair @ 00:14:32", "p.4 ¶2", "msg #87". */
  locator: string
  text: string
  charStart: number
  charEnd: number
  ordinal: number
}

export type ArtifactKind =
  | 'signals'
  | 'reconciled'
  | 'gaps'
  | 'brief'
  | 'blueprint'
  | 'appspec'
  | 'review'

export type ClaimStatus = 'ACCEPTED' | 'REJECTED' | 'EDITED'

export type ClaimOverride = {
  claimId: string
  engagementId: string
  status: ClaimStatus
  text?: string
  updatedAt: string
}

export type RunStatus = 'RUNNING' | 'DONE' | 'FAILED'

export type RunRecord = {
  id: string
  engagementId: string
  status: RunStatus
  startedAt: string
  finishedAt?: string
  error?: string
  /** Stages that exhausted their retries and need a human. */
  needsHumanReview: string[]
}
