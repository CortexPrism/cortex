-- Migration 031: Persist job execution runs for log/history viewing

CREATE TABLE IF NOT EXISTS job_runs (
  id           TEXT PRIMARY KEY,
  job_id       TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status       TEXT NOT NULL,
  exit_code    INTEGER,
  stdout       TEXT,
  stderr       TEXT,
  message      TEXT,
  runner       TEXT NOT NULL DEFAULT 'scheduler',
  started_at   TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at  TEXT,
  duration_ms  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_job_runs_job_started ON job_runs(job_id, started_at DESC);
