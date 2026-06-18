-- Migration 027: Lens Database Sensitivity Classification
-- Add sensitivity metadata to lens.db (audit log) tables
-- This migration is applied to lens.db, not cortex.db

-- Classification levels:
--   'public'    — can be freely accessed by any agent
--   'normal'    — standard data, basic checks apply
--   'sensitive' — DEFAULT, requires justification + supervisor approval
--   'secret'    — requires human approval (passwords, API keys, PII)

-- All audit events are SENSITIVE by default (may contain command history, secrets)
ALTER TABLE lens_events ADD COLUMN sensitivity TEXT DEFAULT 'sensitive';

-- Create index for efficient sensitivity-based filtering
CREATE INDEX IF NOT EXISTS idx_lens_events_sensitivity ON lens_events(sensitivity);
