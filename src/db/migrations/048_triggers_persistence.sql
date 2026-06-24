-- Migration 048: Persist triggers to DB so they survive restarts

CREATE TABLE IF NOT EXISTS triggers (
  name       TEXT PRIMARY KEY,
  enabled    INTEGER NOT NULL DEFAULT 1,
  source     TEXT NOT NULL,
  config     TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_triggers_source ON triggers(source);
CREATE INDEX IF NOT EXISTS idx_triggers_enabled ON triggers(enabled) WHERE enabled = 1;
