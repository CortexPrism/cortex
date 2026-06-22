-- Recreate file_edit_log with 'config' added to the workspace_type CHECK constraint
-- so agents can log writes to SOUL.md, USER.md, MEMORY.md in the config directory.

CREATE TABLE IF NOT EXISTS file_edit_log_new (
  id             TEXT PRIMARY KEY,
  agent_id       TEXT NOT NULL,
  session_id     TEXT,
  workspace_type TEXT NOT NULL CHECK (workspace_type IN ('agent', 'global', 'config')),
  file_path      TEXT NOT NULL,
  before_text    TEXT NOT NULL,
  after_text     TEXT NOT NULL,
  before_hash    TEXT NOT NULL,
  after_hash     TEXT NOT NULL,
  tool           TEXT NOT NULL DEFAULT 'file_write',
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO file_edit_log_new
  SELECT id, agent_id, session_id, workspace_type, file_path,
         before_text, after_text, before_hash, after_hash, tool, created_at
  FROM file_edit_log;

DROP TABLE file_edit_log;

ALTER TABLE file_edit_log_new RENAME TO file_edit_log;

CREATE INDEX IF NOT EXISTS idx_file_edit_agent ON file_edit_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_file_edit_file  ON file_edit_log(file_path);
