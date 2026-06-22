-- Migration 003: Audit/Lens database (lens.db) initial schema

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at  TEXT NOT NULL DEFAULT (datetime('now')),
  checksum    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lens_events (
  id          TEXT PRIMARY KEY,
  event_type  TEXT NOT NULL,
  session_id  TEXT,
  turn_id     TEXT,
  intent_id   TEXT,
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL,
  summary     TEXT,
  payload     TEXT,
  error       TEXT,
  model       TEXT,
  tokens_in   INTEGER NOT NULL DEFAULT 0,
  tokens_out  INTEGER NOT NULL DEFAULT 0,
  cost_usd    REAL NOT NULL DEFAULT 0.0,
  started_at  TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lens_session ON lens_events(session_id);
CREATE INDEX IF NOT EXISTS idx_lens_type    ON lens_events(event_type);
CREATE INDEX IF NOT EXISTS idx_lens_actor   ON lens_events(actor);
CREATE INDEX IF NOT EXISTS idx_lens_time    ON lens_events(started_at);

CREATE TABLE IF NOT EXISTS lens_metrics (
  metric_name  TEXT NOT NULL,
  metric_time  TEXT NOT NULL,
  metric_value REAL NOT NULL,
  labels       TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (metric_name, metric_time)
);
