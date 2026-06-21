-- Migration 039: Shared context table for cross-agent context sharing
-- Cross-agent-context.ts writes/reads namespace-keyed values shared between sessions

CREATE TABLE IF NOT EXISTS shared_context (
  id         TEXT PRIMARY KEY,
  namespace  TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,
  session_id TEXT NOT NULL,
  agent_id   TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_context_ns_key ON shared_context(namespace, key);
CREATE INDEX IF NOT EXISTS idx_shared_context_session ON shared_context(session_id);
CREATE INDEX IF NOT EXISTS idx_shared_context_updated ON shared_context(updated_at);
