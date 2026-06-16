-- Migration 018: Quartermaster — Tool Orchestration Learning System (cortex.db)

CREATE TABLE IF NOT EXISTS qm_patterns (
  id TEXT PRIMARY KEY,
  tool_sequence TEXT NOT NULL,
  context_fingerprint TEXT NOT NULL,
  hit_count INTEGER DEFAULT 1,
  success_count INTEGER DEFAULT 0,
  avg_confidence REAL DEFAULT 0.0,
  last_used TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_qm_patterns_tools ON qm_patterns(tool_sequence);

CREATE TABLE IF NOT EXISTS qm_signal_weights (
  signal_name TEXT PRIMARY KEY,
  weight REAL NOT NULL DEFAULT 0.5,
  confidence_floor REAL NOT NULL DEFAULT 0.0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO qm_signal_weights (signal_name, weight, confidence_floor) VALUES
  ('trajectory', 0.35, 0.1),
  ('episodic', 0.25, 0.1),
  ('toolStats', 0.15, 0.2),
  ('taskContext', 0.15, 0.1),
  ('reflection', 0.10, 0.0);

CREATE TABLE IF NOT EXISTS qm_tool_stats (
  tool_name TEXT PRIMARY KEY,
  total_calls INTEGER DEFAULT 0,
  successful_calls INTEGER DEFAULT 0,
  avg_duration_ms REAL DEFAULT 0.0,
  last_error TEXT,
  last_used TEXT
);

CREATE TABLE IF NOT EXISTS qm_decisions (
  id TEXT PRIMARY KEY,
  turn_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('automate','suggest','defer')),
  predicted_tool TEXT,
  actual_tool TEXT,
  confidence REAL,
  signals_used TEXT,
  was_correct INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_qm_decisions_session ON qm_decisions(session_id);
CREATE INDEX IF NOT EXISTS idx_qm_decisions_turn ON qm_decisions(turn_id);

CREATE TABLE IF NOT EXISTS qm_session_state (
  session_id TEXT PRIMARY KEY,
  observation_count INTEGER DEFAULT 0,
  prediction_count INTEGER DEFAULT 0,
  correct_count INTEGER DEFAULT 0,
  mode TEXT NOT NULL DEFAULT 'observe' CHECK(mode IN ('observe','active')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
