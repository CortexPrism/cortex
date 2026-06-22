-- Migration 013: Add parent_session_id to sessions table for sub-agent tracking

ALTER TABLE sessions ADD COLUMN parent_session_id TEXT REFERENCES sessions(id);
CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_session_id);
