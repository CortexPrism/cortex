CREATE TABLE IF NOT EXISTS mcp_gateway_servers (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  endpoint            TEXT NOT NULL,
  transport           TEXT NOT NULL DEFAULT 'http' CHECK (transport IN ('stdio', 'http')),
  status              TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('healthy', 'degraded', 'unhealthy', 'unknown')),
  last_health_check   TEXT NOT NULL DEFAULT '',
  auth_type           TEXT CHECK (auth_type IN ('none', 'oauth2', 'apiKey', 'bearer')),
  auth_config_json    TEXT NOT NULL DEFAULT '{}',
  tools_json          TEXT NOT NULL DEFAULT '[]',
  tool_count          INTEGER NOT NULL DEFAULT 0,
  rate_limit_json     TEXT,
  tags_json           TEXT NOT NULL DEFAULT '[]',
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  user_id             TEXT REFERENCES users(id),
  team_id             TEXT REFERENCES teams(id)
);

CREATE INDEX IF NOT EXISTS idx_mcp_gateway_status ON mcp_gateway_servers(status);
CREATE INDEX IF NOT EXISTS idx_mcp_gateway_transport ON mcp_gateway_servers(transport);

CREATE TABLE IF NOT EXISTS mcp_gateway_audit (
  id           TEXT PRIMARY KEY,
  timestamp    TEXT NOT NULL DEFAULT (datetime('now')),
  server_id    TEXT NOT NULL REFERENCES mcp_gateway_servers(id) ON DELETE CASCADE,
  tool_name    TEXT NOT NULL,
  client_id    TEXT NOT NULL,
  success      INTEGER NOT NULL DEFAULT 1,
  latency_ms   INTEGER NOT NULL DEFAULT 0,
  error_code   TEXT,
  tokens_used  INTEGER,
  user_id      TEXT REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_mcp_gateway_audit_server ON mcp_gateway_audit(server_id);
CREATE INDEX IF NOT EXISTS idx_mcp_gateway_audit_timestamp ON mcp_gateway_audit(timestamp);
