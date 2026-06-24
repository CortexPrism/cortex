-- Migration 044d: Add user/team scoping columns to existing resource tables (cortex.db)

ALTER TABLE services ADD COLUMN user_id TEXT;
ALTER TABLE services ADD COLUMN team_id TEXT;

ALTER TABLE nodes ADD COLUMN user_id TEXT;
ALTER TABLE nodes ADD COLUMN team_id TEXT;

ALTER TABLE workspace_config ADD COLUMN user_id TEXT;
ALTER TABLE workspace_config ADD COLUMN team_id TEXT;

ALTER TABLE channels ADD COLUMN user_id TEXT;
ALTER TABLE channels ADD COLUMN team_id TEXT;

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_services_user ON services(user_id);
CREATE INDEX IF NOT EXISTS idx_services_team ON services(team_id);
CREATE INDEX IF NOT EXISTS idx_nodes_user ON nodes(user_id);
CREATE INDEX IF NOT EXISTS idx_nodes_team ON nodes(team_id);
CREATE INDEX IF NOT EXISTS idx_channels_user ON channels(user_id);
CREATE INDEX IF NOT EXISTS idx_channels_team ON channels(team_id);
