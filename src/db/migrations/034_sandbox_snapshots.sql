-- 034: Sandbox snapshots, dev env manifests, bug repro runs
CREATE TABLE IF NOT EXISTS sandbox_snapshots (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL DEFAULT '',
  session_id      TEXT NOT NULL,
  agent_id        TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  runtime         TEXT NOT NULL DEFAULT 'docker',
  workspace_path  TEXT NOT NULL DEFAULT '',
  tags            TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_sandbox_snapshots_session ON sandbox_snapshots(session_id);
CREATE INDEX IF NOT EXISTS idx_sandbox_snapshots_created ON sandbox_snapshots(created_at DESC);

CREATE TABLE IF NOT EXISTS workspace_snapshots (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL DEFAULT '',
  session_id      TEXT NOT NULL,
  agent_id        TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  file_count      INTEGER NOT NULL DEFAULT 0,
  git_branch      TEXT NOT NULL DEFAULT '',
  tags            TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_workspace_snapshots_session ON workspace_snapshots(session_id);
CREATE INDEX IF NOT EXISTS idx_workspace_snapshots_created ON workspace_snapshots(created_at DESC);

CREATE TABLE IF NOT EXISTS dev_env_manifests (
  name            TEXT PRIMARY KEY,
  version         TEXT NOT NULL DEFAULT '1.0.0',
  workspace_path  TEXT NOT NULL DEFAULT '',
  manifest_json   TEXT NOT NULL DEFAULT '{}',
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dev_env_manifests_updated ON dev_env_manifests(updated_at DESC);

CREATE TABLE IF NOT EXISTS bug_repro_runs (
  id              TEXT PRIMARY KEY,
  issue_title     TEXT NOT NULL,
  issue_description TEXT NOT NULL DEFAULT '',
  language        TEXT NOT NULL DEFAULT 'python',
  runtime         TEXT NOT NULL DEFAULT 'docker',
  status          TEXT NOT NULL DEFAULT 'queued',
  code            TEXT NOT NULL DEFAULT '',
  test_code       TEXT NOT NULL DEFAULT '',
  stdout          TEXT,
  stderr          TEXT,
  exit_code       INTEGER,
  duration_ms     INTEGER,
  passed          INTEGER NOT NULL DEFAULT 0,
  fixed_code      TEXT,
  rounds          INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  session_id      TEXT NOT NULL DEFAULT '',
  tags            TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_bug_repro_runs_status ON bug_repro_runs(status);
CREATE INDEX IF NOT EXISTS idx_bug_repro_runs_created ON bug_repro_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bug_repro_runs_session ON bug_repro_runs(session_id);
