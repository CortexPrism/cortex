-- Migration 026: Memory Database Sensitivity Classification
-- Add sensitivity metadata to memory.db tables for secure access control
-- This migration is applied to memory.db, not cortex.db

-- Classification levels:
--   'public'    — can be freely accessed by any agent
--   'normal'    — standard data, basic checks apply
--   'sensitive' — DEFAULT, requires justification + supervisor approval
--   'secret'    — requires human approval (passwords, API keys, PII)

-- Episodic memory: conversations and session summaries (default: sensitive)
ALTER TABLE episodic_memory ADD COLUMN sensitivity TEXT DEFAULT 'sensitive';

-- Semantic memory: facts, knowledge, user preferences (default: sensitive)
ALTER TABLE semantic_memory ADD COLUMN sensitivity TEXT DEFAULT 'sensitive';

-- Reflection memory: learned patterns and insights (default: normal)
ALTER TABLE reflection_memory ADD COLUMN sensitivity TEXT DEFAULT 'normal';

-- Graph entities: knowledge graph nodes (default: normal)
ALTER TABLE graph_entities ADD COLUMN sensitivity TEXT DEFAULT 'normal';

-- Create indexes for efficient sensitivity-based filtering
CREATE INDEX IF NOT EXISTS idx_episodic_sensitivity ON episodic_memory(sensitivity);
CREATE INDEX IF NOT EXISTS idx_semantic_sensitivity ON semantic_memory(sensitivity);
CREATE INDEX IF NOT EXISTS idx_reflection_sensitivity ON reflection_memory(sensitivity);
CREATE INDEX IF NOT EXISTS idx_graph_entities_sensitivity ON graph_entities(sensitivity);
