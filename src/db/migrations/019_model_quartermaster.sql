-- Model Quartermaster: Intelligent LLM selection based on learned patterns
-- Migration 019

-- Model performance statistics by category
CREATE TABLE IF NOT EXISTS mqm_model_stats (
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  task_category TEXT NOT NULL,
  total_calls INTEGER DEFAULT 0,
  successful_calls INTEGER DEFAULT 0,
  avg_quality REAL DEFAULT 0,
  avg_cost_usd REAL DEFAULT 0,
  avg_duration_ms REAL DEFAULT 0,
  last_used TEXT,
  PRIMARY KEY (provider, model, task_category)
);

-- Signal weights for model selection (similar to quartermaster)
CREATE TABLE IF NOT EXISTS mqm_signal_weights (
  signal_name TEXT PRIMARY KEY,
  weight REAL NOT NULL DEFAULT 0.2,
  confidence_floor REAL NOT NULL DEFAULT 0.0,
  updated_at TEXT NOT NULL
);

-- Decision audit trail
CREATE TABLE IF NOT EXISTS mqm_decisions (
  id TEXT PRIMARY KEY,
  turn_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  mode TEXT NOT NULL, -- 'enforce' | 'suggest' | 'defer'
  predicted_provider TEXT,
  predicted_model TEXT,
  actual_provider TEXT,
  actual_model TEXT,
  confidence REAL NOT NULL,
  signals_used TEXT NOT NULL, -- JSON array
  was_correct REAL, -- 0-1
  estimated_cost REAL,
  actual_cost REAL,
  created_at TEXT NOT NULL
);

-- Session state tracking
CREATE TABLE IF NOT EXISTS mqm_session_state (
  session_id TEXT PRIMARY KEY,
  observation_count INTEGER DEFAULT 0,
  prediction_count INTEGER DEFAULT 0,
  correct_count INTEGER DEFAULT 0,
  mode TEXT DEFAULT 'observe', -- 'observe' | 'active'
  cost_budget_usd REAL,
  cost_spent_usd REAL DEFAULT 0
);

-- Model usage patterns
CREATE TABLE IF NOT EXISTS mqm_patterns (
  id TEXT PRIMARY KEY,
  task_category TEXT NOT NULL,
  context_fingerprint TEXT NOT NULL, -- JSON
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  hit_count INTEGER DEFAULT 1,
  avg_quality REAL DEFAULT 0,
  avg_cost REAL DEFAULT 0,
  last_used TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Initialize default weights
INSERT OR IGNORE INTO mqm_signal_weights (signal_name, weight, confidence_floor, updated_at)
VALUES 
  ('historical', 0.25, 0.0, datetime('now')),
  ('episodic', 0.20, 0.0, datetime('now')),
  ('cost', 0.15, 0.0, datetime('now')),
  ('quality', 0.25, 0.0, datetime('now')),
  ('trajectory', 0.10, 0.0, datetime('now')),
  ('reflection', 0.05, 0.0, datetime('now'));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_mqm_decisions_session ON mqm_decisions(session_id);
CREATE INDEX IF NOT EXISTS idx_mqm_decisions_turn ON mqm_decisions(turn_id);
CREATE INDEX IF NOT EXISTS idx_mqm_stats_category ON mqm_model_stats(task_category);
CREATE INDEX IF NOT EXISTS idx_mqm_patterns_category ON mqm_patterns(task_category);
