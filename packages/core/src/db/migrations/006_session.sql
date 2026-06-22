-- Migration 006: Per-session database schema (applied to each sess_*.db)

CREATE TABLE IF NOT EXISTS session_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  role        TEXT NOT NULL,
  content     TEXT NOT NULL,
  tool_calls  TEXT,
  tool_result TEXT,
  token_count INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS working_memory (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  ttl_seconds INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS session_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  payload    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
