-- Memori Persistent Checkpointing
-- Full agent state checkpoints for survival across restarts.

CREATE TABLE IF NOT EXISTS memori_checkpoints (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  turn_number INTEGER NOT NULL,
  timestamp TEXT NOT NULL,
  data_json TEXT NOT NULL,
  goal_snapshot TEXT NOT NULL DEFAULT '',
  message_count INTEGER NOT NULL DEFAULT 0,
  tool_call_count INTEGER NOT NULL DEFAULT 0,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_memori_session
ON memori_checkpoints(session_id, turn_number DESC);

CREATE INDEX IF NOT EXISTS idx_memori_agent
ON memori_checkpoints(agent_id, timestamp DESC);
