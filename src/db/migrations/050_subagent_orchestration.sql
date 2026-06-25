-- Migration 050: Background sub-agent orchestration (cortex.db)
-- Tables for durable background sub-agent spawn, wait, apply lifecycle.

CREATE TABLE IF NOT EXISTS subagent_runs (
  id                    TEXT PRIMARY KEY,
  parent_session_id     TEXT NOT NULL REFERENCES sessions(id),
  parent_turn_id        TEXT NOT NULL,
  parent_tool_call_id   TEXT NOT NULL,
  parent_wait_barrier_id TEXT,
  child_session_id      TEXT,
  child_agent_id        TEXT,
  task_name             TEXT NOT NULL,
  task_type             TEXT,
  mode                  TEXT NOT NULL DEFAULT 'read_only' CHECK (mode IN ('read_only', 'write_staged')),
  context_mode          TEXT NOT NULL DEFAULT 'isolated' CHECK (context_mode IN ('isolated', 'bounded_snapshot')),
  status                TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled', 'timed_out', 'ready_for_apply', 'consumed')),
  brief_payload         TEXT NOT NULL DEFAULT '{}',
  result_summary        TEXT,
  final_response        TEXT,
  error                 TEXT,
  usage_json            TEXT NOT NULL DEFAULT '{}',
  base_workspace_ref    TEXT,
  base_snapshot_id      TEXT,
  final_snapshot_id     TEXT,
  change_bundle_json    TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  started_at            TEXT,
  completed_at          TEXT,
  consumed_at           TEXT,
  user_id               TEXT,
  team_id               TEXT
);

CREATE INDEX IF NOT EXISTS idx_subagent_runs_parent ON subagent_runs(parent_session_id);
CREATE INDEX IF NOT EXISTS idx_subagent_runs_status ON subagent_runs(status);
CREATE INDEX IF NOT EXISTS idx_subagent_runs_wait_barrier ON subagent_runs(parent_wait_barrier_id);
CREATE INDEX IF NOT EXISTS idx_subagent_runs_child ON subagent_runs(child_session_id);
CREATE INDEX IF NOT EXISTS idx_subagent_runs_user ON subagent_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_subagent_runs_team ON subagent_runs(team_id);

CREATE TABLE IF NOT EXISTS subagent_run_events (
  id           TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL REFERENCES subagent_runs(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL CHECK (event_type IN ('spawn_requested', 'spawn_accepted', 'started', 'progress', 'completed', 'failed', 'cancelled', 'timed_out', 'wait_registered', 'resume_ready', 'resume_delivered', 'apply_requested', 'apply_succeeded', 'apply_failed', 'consumed')),
  payload_json  TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_subagent_run_events_run ON subagent_run_events(run_id);
CREATE INDEX IF NOT EXISTS idx_subagent_run_events_type ON subagent_run_events(event_type);
