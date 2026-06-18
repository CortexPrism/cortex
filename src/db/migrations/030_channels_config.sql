-- Migration 030: Channel configuration table

-- Drop old channels table if it exists with old schema
DROP TABLE IF EXISTS channels;
DROP INDEX IF EXISTS idx_channels_type;
DROP INDEX IF EXISTS idx_channels_enabled;
DROP INDEX IF EXISTS idx_channels_agent;
DROP INDEX IF EXISTS idx_channels_name;

-- Create new channels table with updated schema
CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  channel_type TEXT NOT NULL, -- discord, slack, teams, telegram, etc.
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  settings TEXT NOT NULL, -- JSON object
  vault_ref TEXT NOT NULL, -- Reference to vault entry
  agent_id TEXT NOT NULL DEFAULT 'default',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_channels_type ON channels(channel_type);
CREATE INDEX idx_channels_enabled ON channels(enabled);
CREATE INDEX idx_channels_agent ON channels(agent_id);
CREATE UNIQUE INDEX idx_channels_name ON channels(name);
