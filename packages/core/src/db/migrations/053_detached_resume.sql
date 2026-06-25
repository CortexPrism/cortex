-- Migration 053: Detached resume delivery (cortex.db)
-- Ensures orchestration_resume_bundles exists with resume_via and delivered_at columns
-- for detached runner lease delivery via the scheduler daemon.

CREATE TABLE IF NOT EXISTS orchestration_resume_bundles (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  wait_barrier_id TEXT NOT NULL,
  run_ids_json TEXT NOT NULL DEFAULT '[]',
  await_mode TEXT DEFAULT 'all',
  barrier_label TEXT,
  resume_via TEXT DEFAULT 'websocket',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'expired')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  delivered_at TEXT
);
