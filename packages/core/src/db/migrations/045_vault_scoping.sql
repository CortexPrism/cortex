-- Migration 044b: Add owner scoping columns to vault_entries (vault.db)

ALTER TABLE vault_entries ADD COLUMN owner_user_id TEXT;
ALTER TABLE vault_entries ADD COLUMN owner_team_id TEXT;

CREATE INDEX IF NOT EXISTS idx_vault_owner_user ON vault_entries(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_vault_owner_team ON vault_entries(owner_team_id);
