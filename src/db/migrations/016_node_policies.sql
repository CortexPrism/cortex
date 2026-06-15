-- Migration 016: Add node_id to policy_rules for per-Node policy profiles

ALTER TABLE policy_rules ADD COLUMN node_id TEXT REFERENCES nodes(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_policy_node_id ON policy_rules(node_id);
