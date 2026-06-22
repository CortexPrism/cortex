-- Migration 035: Compliance metadata for EU AI Act / ISO 42001 / SOC2
-- Adds structured governance metadata to lens.db for per-session and per-turn compliance tracking.

CREATE TABLE IF NOT EXISTS compliance_metadata (
  id                TEXT PRIMARY KEY,
  session_id        TEXT NOT NULL,
  turn_id           TEXT,
  -- Risk level: low, medium, high, critical
  risk_level        TEXT NOT NULL DEFAULT 'medium'
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  -- Data categories touched (JSON array of strings)
  -- Values: pii, financial, health, credentials, proprietary, public, system, code, user_content
  data_categories   TEXT NOT NULL DEFAULT '[]',
  -- Regulatory frameworks applicable (JSON array of strings)
  -- Values: EU AI Act, GDPR, ISO 42001, SOC2, HIPAA, PCI DSS
  frameworks        TEXT NOT NULL DEFAULT '["EU AI Act"]',
  -- Identity of the human or system that approved agent actions
  approver          TEXT,
  -- Data retention period in days
  retention_days    INTEGER NOT NULL DEFAULT 90,
  -- Data sovereignty region (e.g. eu-west, us-east, global)
  data_region       TEXT NOT NULL DEFAULT 'global',
  -- Whether this record is auditable by external auditors
  auditable         INTEGER NOT NULL DEFAULT 1,
  -- Human-readable summary for audit reports
  audit_summary     TEXT,
  -- JSON object with additional contextual metadata
  context           TEXT,
  -- When this record was exported (for tracking export history)
  exported_at       TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_compliance_session ON compliance_metadata(session_id);
CREATE INDEX IF NOT EXISTS idx_compliance_turn    ON compliance_metadata(session_id, turn_id);
CREATE INDEX IF NOT EXISTS idx_compliance_risk    ON compliance_metadata(risk_level);
CREATE INDEX IF NOT EXISTS idx_compliance_export  ON compliance_metadata(exported_at);

-- Session-level compliance summary view
CREATE VIEW IF NOT EXISTS compliance_session_summary AS
SELECT
  session_id,
  MAX(risk_level) AS max_risk_level,
  COUNT(*) AS total_entries,
  COUNT(DISTINCT turn_id) AS turns_tracked,
  GROUP_CONCAT(DISTINCT json_each.value) AS all_data_categories,
  GROUP_CONCAT(DISTINCT fw.value) AS all_frameworks,
  MAX(created_at) AS last_updated
FROM compliance_metadata,
  json_each(compliance_metadata.data_categories),
  json_each(compliance_metadata.frameworks) AS fw
GROUP BY session_id;
