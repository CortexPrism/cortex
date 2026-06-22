-- Migration 010: Micro-service registry
-- Stores service definitions for long-running agent micro-services.

CREATE TABLE IF NOT EXISTS services (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  agent_id      TEXT NOT NULL DEFAULT 'default',
  model         TEXT,
  provider      TEXT,
  system_prompt TEXT,
  tools         TEXT,
  port          INTEGER DEFAULT 0,
  auto_start    INTEGER DEFAULT 0,
  max_restarts  INTEGER DEFAULT 3,
  health_check_interval INTEGER DEFAULT 30,
  env           TEXT,
  status        TEXT NOT NULL DEFAULT 'stopped' CHECK(status IN ('stopped','running','failed','restarting')),
  pid           INTEGER,
  last_started_at TEXT,
  last_health_check TEXT,
  restart_count INTEGER DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
