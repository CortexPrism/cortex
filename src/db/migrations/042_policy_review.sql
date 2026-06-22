-- Migration 042: Policy rules review — fix regex, add path/domain/computer rules, widen CHECK constraint
-- Based on comprehensive security audit (June 2026)

-- 1. Widen the CHECK constraint to support 'path' and 'computer' policy kinds
-- SQLite does not support ALTER COLUMN, so we recreate the table
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS policy_rules_new (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('tool', 'shell', 'domain', 'capability', 'path', 'computer')),
  effect      TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
  pattern     TEXT NOT NULL,
  reason      TEXT,
  priority    INTEGER NOT NULL DEFAULT 100,
  enabled     INTEGER NOT NULL DEFAULT 1,
  node_id     TEXT REFERENCES nodes(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO policy_rules_new (id, kind, effect, pattern, reason, priority, enabled, node_id, created_at)
  SELECT id, kind, effect, pattern, reason, priority, enabled, node_id, created_at FROM policy_rules;

DROP TABLE policy_rules;
ALTER TABLE policy_rules_new RENAME TO policy_rules;

CREATE INDEX IF NOT EXISTS idx_policy_kind    ON policy_rules(kind);
CREATE INDEX IF NOT EXISTS idx_policy_effect  ON policy_rules(effect);
CREATE INDEX IF NOT EXISTS idx_policy_node_id ON policy_rules(node_id);

PRAGMA foreign_keys = ON;

-- 2. Update existing shell deny rules with improved regex patterns
-- Only update if the pattern matches the original (in case users have customized them)

UPDATE policy_rules SET pattern = 'rm\s+(-[a-zA-Z]*[rf][a-zA-Z]*[rf][a-zA-Z]*|-[a-zA-Z]*[rf][a-zA-Z]*\s+-[a-zA-Z]*[rf][a-zA-Z]*|--recursive.*--force|--force.*--recursive)\s+/'
  WHERE id = 'default_deny_rm_rf' AND pattern = 'rm\s+-rf\s+/';

UPDATE policy_rules SET pattern = ':\(\)\s*\{[^}]*:.*:.*\}'
  WHERE id = 'default_deny_fork' AND pattern = ':\(\)\{.*\}';

UPDATE policy_rules SET pattern = 'dd\s+.*of=/dev/[a-zA-Z0-9]+'
  WHERE id = 'default_deny_dd' AND pattern = 'dd\s+if=.*of=/dev/';

UPDATE policy_rules SET pattern = 'chmod\s+(-R\s+)?777\s+'
  WHERE id = 'default_deny_chmod' AND pattern = 'chmod\s+777\s+/';

-- 3. Add new shell deny rules for destructive commands

INSERT OR IGNORE INTO policy_rules (id, kind, effect, pattern, reason, priority) VALUES
  ('default_deny_mkfs',       'shell', 'deny', 'mkfs\\.',                                'Filesystem creation/destruction forbidden', 1),
  ('default_deny_proc_sys',   'shell', 'deny', '>/proc/sys/',                            'Kernel parameter modification forbidden', 1),
  ('default_deny_iptables',   'shell', 'deny', '(iptables|ip6tables|nft|ufw)\\s',        'Firewall manipulation forbidden', 2),
  ('default_deny_crontab',    'shell', 'deny', 'crontab\\s+-',                           'Scheduled task persistence forbidden', 2),
  ('default_deny_git_push',   'shell', 'deny', 'git\\s+push\\s+(?!.*--dry-run)',         'Code exfiltration via git push forbidden', 3);

-- 4. Add default path deny rules for sensitive files

INSERT OR IGNORE INTO policy_rules (id, kind, effect, pattern, reason, priority) VALUES
  ('default_deny_path_shadow',  'path', 'deny', '/etc/shadow',                              'Shadow password file', 1),
  ('default_deny_path_root_ssh','path', 'deny', '/root/\\.ssh/',                            'Root SSH key directory', 1),
  ('default_deny_path_gnupg',   'path', 'deny', '\\.gnupg/',                                'GPG key directory', 1),
  ('default_deny_path_dot_env', 'path', 'deny', '\\.env$',                                  'Environment secrets file', 2),
  ('default_deny_path_id_rsa',  'path', 'deny', 'id_rsa$',                                  'Private SSH key', 1),
  ('default_deny_path_sshd_conf','path','deny', '/etc/ssh/sshd_config',                     'SSH daemon config', 1),
  ('default_deny_path_sudoers', 'path', 'deny', '/etc/sudoers',                             'Sudoers file', 1);

-- 5. Add default domain deny rules for internal/metadata endpoints

INSERT OR IGNORE INTO policy_rules (id, kind, effect, pattern, reason, priority) VALUES
  ('default_deny_domain_aws_metadata',   'domain', 'deny', '169\\.254\\.169\\.254',    'AWS cloud metadata endpoint', 1),
  ('default_deny_domain_gcp_metadata',   'domain', 'deny', 'metadata\\.google\\.internal', 'GCP cloud metadata endpoint', 1),
  ('default_deny_domain_loopback',       'domain', 'deny', '(localhost|127\\.\\d+\\.\\d+\\.\\d+|0\\.0\\.0\\.0|\\[::1\\])', 'Loopback address', 5);

-- 6. Add default computer deny rules for dangerous actions

INSERT OR IGNORE INTO policy_rules (id, kind, effect, pattern, reason, priority) VALUES
  ('default_deny_computer_type_sensitive', 'computer', 'deny', 'type', 'Computer typing action requires explicit allow', 10);
