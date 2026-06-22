-- Migration 005: Plugin database (plugins.db) initial schema

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at  TEXT NOT NULL DEFAULT (datetime('now')),
  checksum    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plugins (
  name                  TEXT PRIMARY KEY,
  version               TEXT NOT NULL,
  prev_version          TEXT,
  type                  TEXT NOT NULL,
  runtime               TEXT NOT NULL DEFAULT 'deno',
  entry                 TEXT NOT NULL,
  manifest_json         TEXT NOT NULL,
  declared_permissions  TEXT NOT NULL,
  effective_permissions TEXT NOT NULL,
  author                TEXT,
  description           TEXT,
  license               TEXT,
  source                TEXT,
  integrity_hash        TEXT,
  enabled               INTEGER NOT NULL DEFAULT 1,
  status                TEXT NOT NULL DEFAULT 'unloaded',
  process_id            INTEGER,
  installed_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT,
  last_load_at          TEXT
);

CREATE TABLE IF NOT EXISTS plugin_permission_overrides (
  plugin_name     TEXT NOT NULL REFERENCES plugins(name),
  permission_path TEXT NOT NULL,
  action          TEXT NOT NULL,
  value           TEXT NOT NULL,
  PRIMARY KEY (plugin_name, permission_path)
);

CREATE TABLE IF NOT EXISTS plugin_state (
  plugin_name TEXT NOT NULL REFERENCES plugins(name),
  key         TEXT NOT NULL,
  value       TEXT,
  PRIMARY KEY (plugin_name, key)
);

CREATE TABLE IF NOT EXISTS tool_aliases (
  alias       TEXT PRIMARY KEY,
  target      TEXT NOT NULL,
  plugin_name TEXT NOT NULL REFERENCES plugins(name),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
