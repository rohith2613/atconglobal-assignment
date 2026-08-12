/**
 * Prism schema, applied idempotently every time a connection opens.
 *
 * Held as a TS constant rather than a .sql file so there is no runtime file
 * resolution to get wrong across dev, build and test — Next.js does not trace
 * arbitrary non-code assets into the server bundle.
 *
 * Shape note: artifacts are stored as whole JSON documents keyed by
 * (engagement, kind) rather than shredded into relational tables. The pipeline
 * rewrites a stage's output wholesale on every run and nothing queries into it
 * server-side, so normalising would buy nothing and cost a migration every time
 * a schema field moves. Evidence is the exception — it is looked up by id on
 * every citation click, so it gets real rows and an index.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS engagements (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  client      TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sources (
  id            TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  name          TEXT NOT NULL,
  bytes         INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'PENDING',
  error         TEXT,
  meta_json     TEXT NOT NULL DEFAULT '{}',
  raw_text      TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sources_engagement ON sources(engagement_id);

CREATE TABLE IF NOT EXISTS evidence (
  id            TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  source_id     TEXT NOT NULL,
  source_type   TEXT NOT NULL,
  locator       TEXT NOT NULL,
  text          TEXT NOT NULL,
  char_start    INTEGER NOT NULL,
  char_end      INTEGER NOT NULL,
  ordinal       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evidence_engagement ON evidence(engagement_id, ordinal);
CREATE INDEX IF NOT EXISTS idx_evidence_source ON evidence(source_id);

CREATE TABLE IF NOT EXISTS artifacts (
  engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  run_id        TEXT NOT NULL,
  json          TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  PRIMARY KEY (engagement_id, kind)
);

CREATE TABLE IF NOT EXISTS trace (
  id                TEXT PRIMARY KEY,
  engagement_id     TEXT NOT NULL,
  run_id            TEXT NOT NULL,
  stage             TEXT NOT NULL,
  role              TEXT NOT NULL,
  model             TEXT NOT NULL,
  prompt_tokens     INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd          REAL    NOT NULL DEFAULT 0,
  latency_ms        INTEGER NOT NULL DEFAULT 0,
  attempt           INTEGER NOT NULL DEFAULT 1,
  ok                INTEGER NOT NULL DEFAULT 1,
  error             TEXT,
  summary           TEXT NOT NULL DEFAULT '',
  created_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trace_engagement ON trace(engagement_id, created_at);

CREATE TABLE IF NOT EXISTS claim_overrides (
  claim_id      TEXT NOT NULL,
  engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  status        TEXT NOT NULL,
  text          TEXT,
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (engagement_id, claim_id)
);

CREATE TABLE IF NOT EXISTS runs (
  id             TEXT PRIMARY KEY,
  engagement_id  TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  status         TEXT NOT NULL,
  started_at     TEXT NOT NULL,
  finished_at    TEXT,
  error          TEXT,
  review_json    TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_runs_engagement ON runs(engagement_id, started_at);
`
