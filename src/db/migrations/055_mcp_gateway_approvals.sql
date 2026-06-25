CREATE TABLE IF NOT EXISTS mcp_gateway_approvals (
  id               TEXT PRIMARY KEY,
  server_id        TEXT NOT NULL REFERENCES mcp_gateway_servers(id) ON DELETE CASCADE,
  tool_name        TEXT NOT NULL,
  args_json        TEXT NOT NULL DEFAULT '{}',
  risk_level       TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  requested_by     TEXT NOT NULL,
  requested_at     TEXT NOT NULL DEFAULT (datetime('now')),
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
  reviewed_by      TEXT,
  reviewed_at      TEXT,
  reason           TEXT,
  user_id          TEXT REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_mcp_gateway_approvals_server ON mcp_gateway_approvals(server_id);
CREATE INDEX IF NOT EXISTS idx_mcp_gateway_approvals_status ON mcp_gateway_approvals(status);
