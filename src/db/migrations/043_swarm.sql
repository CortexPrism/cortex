-- Migration 043: Swarm coordination tables (cortex.db)
-- Supports the distributed agent swarm — cross-instance directive dispatch and
-- resource accounting aggregation.

-- Directives dispatched across swarm nodes
CREATE TABLE IF NOT EXISTS swarm_directives (
  id                TEXT PRIMARY KEY,
  directive_id      TEXT NOT NULL UNIQUE,
  source_node_id    TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_node_id    TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL CHECK(kind IN ('spawn_agent', 'execute_task', 'query_resources', 'forward_message', 'sync_state')),
  payload           TEXT NOT NULL DEFAULT '{}',
  priority          TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'critical')),
  status            TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'dispatched', 'completed', 'failed', 'cancelled', 'timed_out')),
  output            TEXT,
  error             TEXT,
  tokens_in         INTEGER NOT NULL DEFAULT 0,
  tokens_out        INTEGER NOT NULL DEFAULT 0,
  cost_usd          REAL NOT NULL DEFAULT 0.0,
  duration_ms       INTEGER NOT NULL DEFAULT 0,
  tool_calls        INTEGER NOT NULL DEFAULT 0,
  parent_directive_id TEXT,
  dispatched_at     TEXT,
  completed_at      TEXT,
  ttl_ms            INTEGER NOT NULL DEFAULT 120000,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_swarm_directives_status ON swarm_directives(status);
CREATE INDEX IF NOT EXISTS idx_swarm_directives_target ON swarm_directives(target_node_id);
CREATE INDEX IF NOT EXISTS idx_swarm_directives_source ON swarm_directives(source_node_id);
CREATE INDEX IF NOT EXISTS idx_swarm_directives_parent ON swarm_directives(parent_directive_id);

-- Periodic resource snapshots per node for aggregated accounting
CREATE TABLE IF NOT EXISTS swarm_resource_snapshots (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id           TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  tokens_in         INTEGER NOT NULL DEFAULT 0,
  tokens_out        INTEGER NOT NULL DEFAULT 0,
  cost_usd          REAL NOT NULL DEFAULT 0.0,
  tool_calls        INTEGER NOT NULL DEFAULT 0,
  cpu_ms            INTEGER NOT NULL DEFAULT 0,
  cpu_percent       REAL NOT NULL DEFAULT 0.0,
  memory_used_mb    REAL NOT NULL DEFAULT 0.0,
  memory_total_mb   REAL NOT NULL DEFAULT 0.0,
  disk_used_mb      REAL NOT NULL DEFAULT 0.0,
  disk_total_mb     REAL NOT NULL DEFAULT 0.0,
  active_sessions   INTEGER NOT NULL DEFAULT 0,
  active_processes  INTEGER NOT NULL DEFAULT 0,
  uptime_seconds    INTEGER NOT NULL DEFAULT 0,
  snapshot_at       TEXT NOT NULL DEFAULT (datetime('now')),
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_swarm_snapshots_node ON swarm_resource_snapshots(node_id, snapshot_at);

-- Add metrics columns to nodes table (safe ALTER — SQLite allows adding columns)
ALTER TABLE nodes ADD COLUMN cpu_percent REAL NOT NULL DEFAULT 0.0;
ALTER TABLE nodes ADD COLUMN memory_used_mb REAL NOT NULL DEFAULT 0.0;
ALTER TABLE nodes ADD COLUMN memory_total_mb REAL NOT NULL DEFAULT 0.0;
ALTER TABLE nodes ADD COLUMN active_sessions INTEGER NOT NULL DEFAULT 0;
ALTER TABLE nodes ADD COLUMN active_processes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE nodes ADD COLUMN labels TEXT NOT NULL DEFAULT '{}';
ALTER TABLE nodes ADD COLUMN metrics_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE nodes ADD COLUMN a2a_endpoint TEXT NOT NULL DEFAULT '';
