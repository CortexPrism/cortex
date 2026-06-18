-- Migration 018: Channel sessions table

CREATE TABLE IF NOT EXISTS channel_sessions (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  platform_channel_id TEXT NOT NULL,
  platform_thread_id TEXT,
  platform_user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  last_message_at INTEGER NOT NULL,
  metadata TEXT, -- JSON field for platform-specific data
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_channel_sessions_session ON channel_sessions(session_id);
CREATE INDEX idx_channel_sessions_platform ON channel_sessions(platform, platform_channel_id);
CREATE INDEX idx_channel_sessions_user ON channel_sessions(platform, platform_user_id);
CREATE INDEX idx_channel_sessions_channel ON channel_sessions(channel_id);
