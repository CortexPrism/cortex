-- Migration 022: Add enabled flag to policy_rules
ALTER TABLE policy_rules ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
