-- Migration 051: Sub-agent wait barriers (cortex.db)
-- Supports multiple concurrent wait barriers with await_mode (all/any/count).

CREATE TABLE IF NOT EXISTS subagent_wait_barriers (
  id             TEXT PRIMARY KEY,
  session_id     TEXT NOT NULL,
  turn_id        TEXT NOT NULL,
  label          TEXT,
  await_mode     TEXT NOT NULL DEFAULT 'all' CHECK (await_mode IN ('all', 'any', 'count')),
  required_count INTEGER,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'expired')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_swb_session ON subagent_wait_barriers(session_id);
CREATE INDEX IF NOT EXISTS idx_swb_status ON subagent_wait_barriers(status);
