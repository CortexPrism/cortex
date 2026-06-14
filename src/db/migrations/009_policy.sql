-- Migration 009: Policy rules table (cortex.db)

CREATE TABLE IF NOT EXISTS policy_rules (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('tool', 'shell', 'domain', 'capability')),
  effect      TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
  pattern     TEXT NOT NULL,
  reason      TEXT,
  priority    INTEGER NOT NULL DEFAULT 100,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_policy_kind   ON policy_rules(kind);
CREATE INDEX IF NOT EXISTS idx_policy_effect ON policy_rules(effect);

INSERT OR IGNORE INTO policy_rules (id, kind, effect, pattern, reason, priority) VALUES
  ('default_deny_rm_rf',  'shell', 'deny',  'rm\s+-rf\s+/',        'Recursive root delete forbidden', 1),
  ('default_deny_fork',   'shell', 'deny',  ':\(\)\{.*\}',          'Fork bomb pattern forbidden',    1),
  ('default_deny_dd',     'shell', 'deny',  'dd\s+if=.*of=/dev/',   'Direct disk write forbidden',    1),
  ('default_deny_chmod',  'shell', 'deny',  'chmod\s+777\s+/',      'World-write on root forbidden',  1),
  ('default_allow_tools', 'tool',  'allow', '.*',                   'All tools allowed by default',   200);
