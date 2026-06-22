-- Migration 019: Channel messages table

CREATE TABLE IF NOT EXISTS channel_messages (
  id TEXT PRIMARY KEY,
  channel_session_id TEXT NOT NULL,
  platform_message_id TEXT NOT NULL,
  direction TEXT NOT NULL, -- 'inbound' or 'outbound'
  content TEXT,
  attachments TEXT, -- JSON array of attachments
  embed TEXT, -- JSON object for rich embeds
  metadata TEXT, -- JSON field for platform-specific data
  created_at INTEGER NOT NULL,
  edited_at INTEGER,
  deleted_at INTEGER,
  FOREIGN KEY (channel_session_id) REFERENCES channel_sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_channel_messages_session ON channel_messages(channel_session_id);
CREATE INDEX idx_channel_messages_platform ON channel_messages(platform_message_id);
CREATE INDEX idx_channel_messages_direction ON channel_messages(direction);
CREATE INDEX idx_channel_messages_created ON channel_messages(created_at);
