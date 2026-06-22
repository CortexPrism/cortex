-- Migration 038: Add last_accessed column to episodic_memory
-- Required for heuristic decay re-scoring and access tracking symmetry with semantic_memory

ALTER TABLE episodic_memory ADD COLUMN last_accessed TEXT;

CREATE INDEX IF NOT EXISTS idx_episodic_last_access ON episodic_memory(last_accessed);
