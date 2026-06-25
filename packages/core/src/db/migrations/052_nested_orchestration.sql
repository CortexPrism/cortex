-- Migration 052: Nested orchestration support (cortex.db)
-- Adds parent_run_id and depth columns to subagent_runs for nested background orchestration.

ALTER TABLE subagent_runs ADD COLUMN parent_run_id TEXT REFERENCES subagent_runs(id);
ALTER TABLE subagent_runs ADD COLUMN depth INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_subagent_runs_parent_run ON subagent_runs(parent_run_id);
CREATE INDEX IF NOT EXISTS idx_subagent_runs_depth ON subagent_runs(depth);
