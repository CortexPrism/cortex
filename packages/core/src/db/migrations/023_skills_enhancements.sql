-- Migration 023: Skills system enhancements
-- Adds lifecycle management, hierarchical organization, trust tiering,
-- quality signals, dependency tracking, and embedding support.

-- Lifecycle state: candidate | verified | released | degraded | deprecated | archived
ALTER TABLE procedural_memory ADD COLUMN lifecycle TEXT NOT NULL DEFAULT 'candidate';

-- Hierarchical skill tree
ALTER TABLE procedural_memory ADD COLUMN parent_skill_id TEXT;

-- Security trust tier: 1 (untrusted/LLM-extracted) to 4 (vetted built-in)
ALTER TABLE procedural_memory ADD COLUMN trust_tier INTEGER NOT NULL DEFAULT 1;

-- Quality signals beyond success_rate
ALTER TABLE procedural_memory ADD COLUMN utility_score REAL NOT NULL DEFAULT 0.0;
ALTER TABLE procedural_memory ADD COLUMN freshness REAL NOT NULL DEFAULT 1.0;
ALTER TABLE procedural_memory ADD COLUMN token_cost INTEGER NOT NULL DEFAULT 0;
ALTER TABLE procedural_memory ADD COLUMN last_used_at TEXT;
ALTER TABLE procedural_memory ADD COLUMN last_validated_at TEXT;
ALTER TABLE procedural_memory ADD COLUMN deprecated_reason TEXT;

-- Dependency and compatibility tracking (JSON arrays of skill names)
ALTER TABLE procedural_memory ADD COLUMN depends_on TEXT;
ALTER TABLE procedural_memory ADD COLUMN conflicts_with TEXT;

-- Embedding for semantic retrieval
ALTER TABLE procedural_memory ADD COLUMN embedding BLOB;
ALTER TABLE procedural_memory ADD COLUMN embedding_model TEXT;

-- Indexes for new query patterns
CREATE INDEX IF NOT EXISTS idx_procedural_memory_lifecycle ON procedural_memory(lifecycle);
CREATE INDEX IF NOT EXISTS idx_procedural_memory_parent ON procedural_memory(parent_skill_id);
CREATE INDEX IF NOT EXISTS idx_procedural_memory_trust_tier ON procedural_memory(trust_tier);
CREATE INDEX IF NOT EXISTS idx_procedural_memory_last_used ON procedural_memory(last_used_at);
CREATE INDEX IF NOT EXISTS idx_procedural_memory_utility ON procedural_memory(utility_score);
