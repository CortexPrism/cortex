-- Migration 054: Auto-apply support (cortex.db)
-- Adds auto_apply columns to subagent_runs for automatic change bundle application.

ALTER TABLE subagent_runs ADD COLUMN auto_apply INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subagent_runs ADD COLUMN auto_apply_policy_json TEXT;
ALTER TABLE subagent_runs ADD COLUMN auto_applied_at TEXT;
