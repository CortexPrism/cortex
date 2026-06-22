CREATE TABLE IF NOT EXISTS workspace_config (
  id          TEXT PRIMARY KEY,
  agent_id    TEXT NOT NULL,
  workspace_dir TEXT NOT NULL,
  git_branch  TEXT NOT NULL DEFAULT 'main',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_workspace_agent ON workspace_config(agent_id);

CREATE TABLE IF NOT EXISTS file_edit_log (
  id          TEXT PRIMARY KEY,
  agent_id    TEXT NOT NULL,
  session_id  TEXT,
  workspace_type TEXT NOT NULL CHECK (workspace_type IN ('agent', 'global')),
  file_path   TEXT NOT NULL,
  before_text TEXT NOT NULL,
  after_text  TEXT NOT NULL,
  before_hash TEXT NOT NULL,
  after_hash  TEXT NOT NULL,
  tool        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_file_edit_agent ON file_edit_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_file_edit_file  ON file_edit_log(file_path);
