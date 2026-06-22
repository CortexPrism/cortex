-- Migration 004: Vault database (vault.db) initial schema

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at  TEXT NOT NULL DEFAULT (datetime('now')),
  checksum    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vault_entries (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL UNIQUE,
  service           TEXT NOT NULL,
  encrypted_data    BLOB NOT NULL,
  encryption_key_id TEXT NOT NULL,
  credential_type   TEXT NOT NULL,
  expires_at        TEXT,
  last_used_at      TEXT,
  allowed_agents    TEXT NOT NULL DEFAULT '[]',
  usage_limit       INTEGER,
  usage_count       INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vault_service ON vault_entries(service);

CREATE TABLE IF NOT EXISTS vault_access_log (
  id            TEXT PRIMARY KEY,
  credential_id TEXT NOT NULL REFERENCES vault_entries(id),
  requestor     TEXT NOT NULL,
  intent_id     TEXT,
  granted       INTEGER NOT NULL,
  reason        TEXT,
  accessed_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vault_access_cred ON vault_access_log(credential_id);
CREATE INDEX IF NOT EXISTS idx_vault_access_time ON vault_access_log(accessed_at);
