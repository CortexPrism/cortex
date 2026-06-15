-- Migration 015: Node registry table (cortex.db)
-- Stores registered Cortex Nodes for the distributed agent system.

CREATE TABLE IF NOT EXISTS nodes (
  id                          TEXT PRIMARY KEY,
  name                        TEXT NOT NULL,
  endpoint                    TEXT NOT NULL,
  tier                        TEXT NOT NULL DEFAULT 'unprivileged' CHECK(tier IN ('root', 'sudo', 'unprivileged')),
  status                      TEXT NOT NULL DEFAULT 'disconnected' CHECK(status IN ('connecting', 'connected', 'disconnected', 'error', 'deregistered')),
  capabilities                TEXT NOT NULL DEFAULT '[]',
  version                     TEXT,
  group_name                  TEXT,
  last_heartbeat              TEXT,
  last_processed_directive_id TEXT,
  registered_at               TEXT NOT NULL DEFAULT (datetime('now')),
  created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_nodes_status ON nodes(status);
CREATE INDEX IF NOT EXISTS idx_nodes_group  ON nodes(group_name);
