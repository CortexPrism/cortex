-- Migration 040: Linked sessions table for cross-session continuity
-- Persists session link groups that were previously only stored in-memory.
-- One link group (id) contains many sessions (session_id), so the
-- primary key is the composite of (id, session_id).

CREATE TABLE IF NOT EXISTS linked_sessions (
  id         TEXT NOT NULL,
  session_id TEXT NOT NULL,
  namespace  TEXT NOT NULL DEFAULT 'default',
  linked_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_linked_sessions_id ON linked_sessions(id);
CREATE INDEX IF NOT EXISTS idx_linked_sessions_session ON linked_sessions(session_id);
