-- Migration 044a: Identity tables — users, teams, memberships, tokens, agents, instance_identity, federation_peers (cortex.db)

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  username        TEXT NOT NULL UNIQUE,
  display_name    TEXT,
  email           TEXT,
  password_hash   TEXT,
  password_salt   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  disabled_at     TEXT
);

CREATE TABLE IF NOT EXISTS teams (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  join_policy     TEXT NOT NULL DEFAULT 'closed' CHECK (join_policy IN ('open','invite','closed')),
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS team_memberships (
  user_id         TEXT NOT NULL REFERENCES users(id),
  team_id         TEXT NOT NULL REFERENCES teams(id),
  role            TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  permissions_json TEXT NOT NULL DEFAULT '{}',
  joined_at       TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, team_id)
);

CREATE TABLE IF NOT EXISTS user_tokens (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  name            TEXT NOT NULL,
  token_hash      TEXT NOT NULL UNIQUE,
  team_ids        TEXT NOT NULL DEFAULT '[]',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at      TEXT,
  last_used_at    TEXT,
  revoked_at      TEXT
);

CREATE TABLE IF NOT EXISTS agents (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  icon            TEXT,
  category        TEXT,
  version         TEXT,
  soul            TEXT,
  soul_file       TEXT,
  user_file       TEXT,
  memory_file     TEXT,
  system_prompt   TEXT,
  provider        TEXT,
  model           TEXT,
  max_turns       INTEGER,
  temperature     REAL,
  tools           TEXT NOT NULL DEFAULT '[]',
  router          TEXT,
  tags            TEXT NOT NULL DEFAULT '[]',
  builtin         INTEGER NOT NULL DEFAULT 0,
  resource_limits TEXT,
  personality     TEXT,
  user_id         TEXT,
  team_id         TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id);
CREATE INDEX IF NOT EXISTS idx_agents_team_id ON agents(team_id);
CREATE INDEX IF NOT EXISTS idx_agents_scope ON agents(user_id, team_id);

CREATE TABLE IF NOT EXISTS resource_shares (
  id              TEXT PRIMARY KEY,
  resource_type   TEXT NOT NULL,
  resource_id     TEXT NOT NULL,
  from_user_id    TEXT NOT NULL REFERENCES users(id),
  to_user_id      TEXT NOT NULL REFERENCES users(id),
  permission      TEXT NOT NULL DEFAULT 'read' CHECK (permission IN ('read','write','admin')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(resource_type, resource_id, to_user_id)
);

CREATE INDEX IF NOT EXISTS idx_resource_shares_to ON resource_shares(to_user_id);
CREATE INDEX IF NOT EXISTS idx_resource_shares_from ON resource_shares(from_user_id);

CREATE TABLE IF NOT EXISTS instance_identity (
  id                  TEXT PRIMARY KEY,
  public_key          TEXT NOT NULL,
  private_key_encrypted TEXT NOT NULL,
  instance_name       TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS federation_peers (
  id              TEXT PRIMARY KEY,
  peer_name       TEXT NOT NULL,
  endpoint        TEXT NOT NULL,
  public_key      TEXT NOT NULL,
  paired_at       TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at      TEXT
);
