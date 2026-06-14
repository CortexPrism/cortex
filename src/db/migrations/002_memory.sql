-- Migration 002: Memory database (memory.db) initial schema

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at  TEXT NOT NULL DEFAULT (datetime('now')),
  checksum    TEXT NOT NULL
);

-- Tier 2: Episodic memory
CREATE TABLE IF NOT EXISTS episodic_memory (
  id                    TEXT PRIMARY KEY,
  session_id            TEXT,
  summary               TEXT NOT NULL,
  topics                TEXT NOT NULL DEFAULT '[]',
  entities              TEXT NOT NULL DEFAULT '[]',
  start_time            TEXT NOT NULL,
  end_time              TEXT,
  turn_count            INTEGER NOT NULL DEFAULT 0,
  importance            REAL NOT NULL DEFAULT 0.5,
  access_count          INTEGER NOT NULL DEFAULT 0,
  consolidated_to_tier3 INTEGER NOT NULL DEFAULT 0,
  expires_at            TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_episodic_session   ON episodic_memory(session_id);
CREATE INDEX IF NOT EXISTS idx_episodic_time      ON episodic_memory(start_time);
CREATE INDEX IF NOT EXISTS idx_episodic_importance ON episodic_memory(importance DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS episodic_fts USING fts5(
  summary,
  topics,
  content='episodic_memory',
  content_rowid='rowid',
  tokenize='porter'
);

-- Tier 3: Semantic memory (facts + knowledge)
CREATE TABLE IF NOT EXISTS semantic_memory (
  id            TEXT PRIMARY KEY,
  content       TEXT NOT NULL,
  summary       TEXT,
  source        TEXT,
  category      TEXT NOT NULL DEFAULT 'general',
  tags          TEXT NOT NULL DEFAULT '[]',
  entities      TEXT NOT NULL DEFAULT '[]',
  embedding_id  INTEGER,
  importance    REAL NOT NULL DEFAULT 0.5,
  access_count  INTEGER NOT NULL DEFAULT 0,
  last_accessed TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_semantic_category    ON semantic_memory(category);
CREATE INDEX IF NOT EXISTS idx_semantic_importance  ON semantic_memory(importance DESC, access_count DESC);
CREATE INDEX IF NOT EXISTS idx_semantic_last_access ON semantic_memory(last_accessed);

CREATE VIRTUAL TABLE IF NOT EXISTS semantic_fts USING fts5(
  content,
  summary,
  content='semantic_memory',
  content_rowid='rowid',
  tokenize='porter'
);

-- Tier 3: Knowledge graph — entities
CREATE TABLE IF NOT EXISTS graph_entities (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL,
  aliases      TEXT NOT NULL DEFAULT '[]',
  description  TEXT,
  embedding_id INTEGER,
  importance   REAL NOT NULL DEFAULT 0.5,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_graph_entities_name ON graph_entities(name);
CREATE INDEX IF NOT EXISTS idx_graph_entities_type ON graph_entities(type);

-- Tier 3: Knowledge graph — typed edge definitions
CREATE TABLE IF NOT EXISTS graph_relation_types (
  type        TEXT PRIMARY KEY,
  description TEXT NOT NULL
);

INSERT OR IGNORE INTO graph_relation_types VALUES
  ('uses',        'Entity A uses Entity B as a dependency or component'),
  ('replaces',    'Entity A replaces Entity B (new version supersedes old)'),
  ('extends',     'Entity A extends Entity B with additional capabilities'),
  ('authored_by', 'Entity A was created/written by Entity B'),
  ('applies_to',  'Entity A (rule/skill/pattern) is relevant to Entity B'),
  ('owns',        'Entity A owns or manages Entity B'),
  ('runs',        'Entity A runs on Entity B (deployment relationship)'),
  ('depends_on',  'Entity A requires Entity B to function'),
  ('deployed_on', 'Entity A is deployed to or inside Entity B'),
  ('triggers',    'Entity A triggers an action in Entity B'),
  ('blocks',      'Entity A blocks Entity B (conflict or hard dependency)'),
  ('requires',    'Entity A requires Entity B as a prerequisite'),
  ('configures',  'Entity A configures or sets up Entity B');

-- Tier 3: Knowledge graph — typed relationship edges
CREATE TABLE IF NOT EXISTS graph_relations (
  id             TEXT PRIMARY KEY,
  source_id      TEXT NOT NULL REFERENCES graph_entities(id) ON DELETE CASCADE,
  target_id      TEXT NOT NULL REFERENCES graph_entities(id) ON DELETE CASCADE,
  relation       TEXT NOT NULL REFERENCES graph_relation_types(type),
  strength       REAL NOT NULL DEFAULT 1.0,
  access_count   INTEGER NOT NULL DEFAULT 0,
  last_accessed  TEXT,
  source_session TEXT,
  metadata       TEXT NOT NULL DEFAULT '{}',
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_graph_relations_source ON graph_relations(source_id);
CREATE INDEX IF NOT EXISTS idx_graph_relations_target ON graph_relations(target_id);
CREATE INDEX IF NOT EXISTS idx_graph_relations_type   ON graph_relations(relation);
CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_relations_unique ON graph_relations(source_id, target_id, relation);

-- Tier 4: Procedural memory (skills)
CREATE TABLE IF NOT EXISTS procedural_memory (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL UNIQUE,
  description      TEXT,
  trigger_pattern  TEXT,
  steps            TEXT NOT NULL,
  success_rate     REAL NOT NULL DEFAULT 0.0,
  invocation_count INTEGER NOT NULL DEFAULT 0,
  version          INTEGER NOT NULL DEFAULT 1,
  source_session   TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Tier 5: Reflection memory (learned patterns)
CREATE TABLE IF NOT EXISTS reflection_memory (
  id                TEXT PRIMARY KEY,
  pattern           TEXT NOT NULL,
  category          TEXT NOT NULL DEFAULT 'general',
  supporting_events INTEGER NOT NULL DEFAULT 0,
  confidence        REAL NOT NULL DEFAULT 0.5,
  source_sessions   TEXT NOT NULL DEFAULT '[]',
  last_reinforced   TEXT,
  stale_threshold   INTEGER NOT NULL DEFAULT 14,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reflection_category   ON reflection_memory(category);
CREATE INDEX IF NOT EXISTS idx_reflection_confidence ON reflection_memory(confidence DESC);
