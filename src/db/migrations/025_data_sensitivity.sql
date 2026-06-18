-- Migration 025: Data Sensitivity Classification
-- Add sensitivity metadata to all data stores to enable secure access control

-- Memory database tables would be in memory.db but this migration is for cortex.db
-- Classification levels:
--   'public'    — can be freely accessed by any agent
--   'normal'    — standard data, basic checks apply
--   'sensitive' — DEFAULT, requires justification + supervisor approval
--   'secret'    — requires human approval (passwords, API keys, PII)

-- Note: Memory database (memory.db), Lens database (lens.db), and Vault database (vault.db)
-- have their own migration files and will be updated separately

-- Core database (cortex.db)
ALTER TABLE sessions ADD COLUMN sensitivity TEXT DEFAULT 'sensitive';
ALTER TABLE agents ADD COLUMN sensitivity TEXT DEFAULT 'normal';

-- Create indexes for efficient sensitivity-based queries
CREATE INDEX IF NOT EXISTS idx_sessions_sensitivity ON sessions(sensitivity);
CREATE INDEX IF NOT EXISTS idx_agents_sensitivity ON agents(sensitivity);
