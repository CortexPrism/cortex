-- Add metadata to skills (tags, difficulty, prerequisites, examples)
ALTER TABLE procedural_memory ADD COLUMN metadata TEXT;

-- Add indexes for skill lookups
CREATE INDEX IF NOT EXISTS idx_procedural_memory_origin ON procedural_memory(origin);
CREATE INDEX IF NOT EXISTS idx_procedural_memory_name ON procedural_memory(name);
