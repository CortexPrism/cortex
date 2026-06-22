-- Migration 001: Core database (cortex.db) initial schema

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at  TEXT NOT NULL DEFAULT (datetime('now')),
  checksum    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  schedule_kind   TEXT NOT NULL,
  schedule_config TEXT NOT NULL,
  next_run_at     TEXT,
  last_run_at     TEXT,
  action_kind     TEXT NOT NULL,
  action_config   TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  claimed_by      TEXT,
  claimed_at      TEXT,
  retry_count     INTEGER NOT NULL DEFAULT 0,
  max_retries     INTEGER NOT NULL DEFAULT 3,
  retry_delay_ms  INTEGER NOT NULL DEFAULT 30000,
  result          TEXT,
  error           TEXT,
  duration_ms     INTEGER,
  parent_job_id   TEXT REFERENCES jobs(id),
  next_job_id     TEXT REFERENCES jobs(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_next ON jobs(status, next_run_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_jobs_claimed ON jobs(claimed_by) WHERE claimed_by IS NOT NULL;

CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  name            TEXT,
  agent_id        TEXT NOT NULL DEFAULT 'default',
  node_id         TEXT,
  channel         TEXT NOT NULL DEFAULT 'cli',
  status          TEXT NOT NULL DEFAULT 'active',
  turn_count      INTEGER NOT NULL DEFAULT 0,
  context_size    INTEGER NOT NULL DEFAULT 0,
  started_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_turn_at    TEXT,
  closed_at       TEXT,
  expires_at      TEXT,
  user_id         TEXT,
  tags            TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_channel ON sessions(channel);

CREATE TABLE IF NOT EXISTS channels (
  id                  TEXT PRIMARY KEY,
  protocol            TEXT NOT NULL,
  platform_id         TEXT NOT NULL,
  name                TEXT,
  agent_id            TEXT NOT NULL DEFAULT 'default',
  enabled             INTEGER NOT NULL DEFAULT 1,
  config              TEXT NOT NULL DEFAULT '{}',
  credential_ref      TEXT,
  max_response_length INTEGER DEFAULT 2000,
  allow_commands      INTEGER NOT NULL DEFAULT 1,
  allow_attachments   INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(protocol, platform_id)
);

CREATE TABLE IF NOT EXISTS config (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO config VALUES ('cluster.name', 'default', 'Cluster identifier', datetime('now'));
INSERT OR IGNORE INTO config VALUES ('agent.default_model', '', 'Default model (set during setup)', datetime('now'));
INSERT OR IGNORE INTO config VALUES ('db.wal_mode', '1', 'SQLite WAL mode enabled', datetime('now'));
