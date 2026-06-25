-- Migration 056: Workspace boundary policy rules (cortex.db)
-- 1. Widen the CHECK constraint on policy_rules.kind to include 'workspace'
-- 2. Add default deny rule for workspace:global access

-- Widen constraint via table rebuild (SQLite lacks ALTER TABLE DROP CONSTRAINT)
CREATE TABLE IF NOT EXISTS policy_rules_new (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('tool', 'shell', 'domain', 'capability', 'path', 'computer', 'workspace')),
  effect      TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
  pattern     TEXT NOT NULL,
  reason      TEXT,
  priority    INTEGER NOT NULL DEFAULT 100,
  enabled     INTEGER NOT NULL DEFAULT 1,
  node_id     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO policy_rules_new SELECT * FROM policy_rules;

DROP TABLE policy_rules;
ALTER TABLE policy_rules_new RENAME TO policy_rules;

CREATE INDEX IF NOT EXISTS idx_policy_rules_kind ON policy_rules(kind);
CREATE INDEX IF NOT EXISTS idx_policy_rules_enabled ON policy_rules(enabled);

-- Add default deny rule for workspace:global (priority 150 between deny rules ~1-10 and default_allow_tools at 200)
INSERT OR IGNORE INTO policy_rules (id, kind, effect, pattern, reason, priority, enabled, node_id, created_at)
VALUES ('default_deny_workspace_global', 'workspace', 'deny', 'global',
        'Global workspace access denied by default — requires explicit allow rule', 150, 1, NULL, datetime('now'));
