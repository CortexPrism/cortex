/**
 * MCP Servers & Gateway System Tests
 *
 * Covers:
 *   - mcp-gateway/registry.ts — CRUD, filtering, counts
 *   - mcp-gateway/gateway.ts — rate limiter, health check, audit log, risk assessment, approvals
 *   - mcp/server.ts — JSON-RPC handler (initialize, tools/list, tools/call, errors)
 *   - mcp/client.ts — connection config types
 */
import {
  assert,
  assertEquals,
  assertExists,
  assertGreater,
  assertMatch,
  assertRejects,
  assertStringIncludes,
} from '@std/assert';

// ── Gateway Registry ────────────────────────────────────────────────────
import {
  findServersByTag,
  getDegradedServers,
  getHealthyServers,
  getServer,
  getServerCount,
  getServersByTransport,
  listServers,
  registerServer,
  removeServer,
  updateServer,
} from '../src/mcp-gateway/registry.ts';
import type { McpServerEntry } from '../src/mcp-gateway/types.ts';

function makeEntry(overrides: Partial<McpServerEntry> = {}): McpServerEntry {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    name: overrides.name ?? 'test-server',
    endpoint: overrides.endpoint ?? 'http://localhost:9001/mcp',
    transport: overrides.transport ?? 'http',
    status: overrides.status ?? 'healthy',
    lastHealthCheck: overrides.lastHealthCheck ?? new Date().toISOString(),
    tools: overrides.tools ?? ['tool-a', 'tool-b'],
    toolCount: overrides.toolCount ?? 2,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
    tags: overrides.tags ?? [],
  };
}

Deno.test('mcp-gateway/registry: registerServer and getServer', async () => {
  const entry = makeEntry({ id: 'srv-1', name: 'alpha' });
  await registerServer(entry);

  const found = await getServer('srv-1');
  assertExists(found);
  assertEquals(found.name, 'alpha');
  assertEquals(found.toolCount, 2);
});

Deno.test('mcp-gateway/registry: listServers returns all entries', async () => {
  await registerServer(makeEntry({ id: 'srv-a', name: 'server-a' }));
  await registerServer(makeEntry({ id: 'srv-b', name: 'server-b' }));

  const all = await listServers();
  assertGreater(all.length, 1);
  const ids = all.map((s) => s.id);
  assert(ids.includes('srv-a'));
  assert(ids.includes('srv-b'));
});

Deno.test('mcp-gateway/registry: updateServer modifies fields and sets updatedAt', async () => {
  await registerServer(makeEntry({ id: 'srv-up', name: 'before' }));
  const original = await getServer('srv-up');
  assertExists(original);
  const originalUpdatedAt = String(original.updatedAt);

  await new Promise((r) => setTimeout(r, 5));
  const updated = await updateServer('srv-up', { name: 'after', toolCount: 5 });
  assertExists(updated);
  assertEquals(updated.name, 'after');
  assertEquals(updated.toolCount, 5);
  assertEquals(updated.id, 'srv-up');
  assertEquals(updated.createdAt, original.createdAt);
  assert(updated.updatedAt !== originalUpdatedAt);
});

Deno.test('mcp-gateway/registry: updateServer returns null for missing id', async () => {
  const result = await updateServer('nonexistent', { name: 'ghost' });
  assertEquals(result, null);
});

Deno.test('mcp-gateway/registry: removeServer deletes entry', async () => {
  await registerServer(makeEntry({ id: 'srv-rm', name: 'to-remove' }));
  assert(await getServer('srv-rm'));
  const removed = await removeServer('srv-rm');
  assertEquals(removed, true);
  assertEquals(await getServer('srv-rm'), undefined);
});

Deno.test('mcp-gateway/registry: removeServer returns false for missing', async () => {
  assertEquals(await removeServer('no-such'), false);
});

Deno.test('mcp-gateway/registry: getServerCount reflects entries', async () => {
  const before = await getServerCount();
  await registerServer(makeEntry({ id: 'cnt-' + crypto.randomUUID() }));
  assertEquals(await getServerCount(), before + 1);
});

Deno.test('mcp-gateway/registry: getHealthyServers filters by status', async () => {
  await registerServer(makeEntry({ id: 'healthy-1', status: 'healthy' }));
  await registerServer(makeEntry({ id: 'unhealthy-1', status: 'unhealthy' }));
  await registerServer(makeEntry({ id: 'degraded-1', status: 'degraded' }));

  const healthy = await getHealthyServers();
  assert(healthy.length >= 1);
  for (const s of healthy) {
    assertEquals(s.status, 'healthy');
  }
});

Deno.test('mcp-gateway/registry: getDegradedServers filters degraded+unhealthy', async () => {
  const degraded = await getDegradedServers();
  for (const s of degraded) {
    assert(s.status === 'degraded' || s.status === 'unhealthy');
  }
});

Deno.test('mcp-gateway/registry: findServersByTag matches tags', async () => {
  await registerServer(makeEntry({ id: 'tagged-1', tags: ['prod', 'critical'] }));
  await registerServer(makeEntry({ id: 'tagged-2', tags: ['staging'] }));

  const prod = await findServersByTag('prod');
  assert(prod.length >= 1);
  for (const s of prod) {
    assert(s.tags?.includes('prod'));
  }
});

Deno.test('mcp-gateway/registry: findServersByTag returns empty for missing tag', async () => {
  const missing = await findServersByTag('no-such-tag-xyz');
  assertEquals(missing.length, 0);
});

Deno.test('mcp-gateway/registry: getServersByTransport filters by transport', async () => {
  await registerServer(makeEntry({ id: 'http-1', transport: 'http' }));
  await registerServer(makeEntry({ id: 'stdio-1', transport: 'stdio' }));

  const httpOnly = await getServersByTransport('http');
  for (const s of httpOnly) {
    assertEquals(s.transport, 'http');
  }
});

// ── Gateway Core ────────────────────────────────────────────────────────
import {
  approveGatewayRequest,
  assessRiskLevel,
  createApproval,
  createRateLimiter,
  denyGatewayRequest,
  getAuditLogs,
  getGatewayApproval,
  getPendingGatewayApprovals,
  logAudit,
} from '../src/mcp-gateway/gateway.ts';

Deno.test('mcp-gateway/gateway: createRateLimiter allows up to limit then denies', () => {
  const limiter = createRateLimiter({ maxRequestsPerMinute: 5 });
  const key = 'client-1';

  for (let i = 0; i < 5; i++) {
    assertEquals(limiter.allowRequest(key), true, `request ${i} should be allowed`);
  }
  assertEquals(limiter.allowRequest(key), false);
});

Deno.test('mcp-gateway/gateway: createRateLimiter getAvailableTokens reports remaining', () => {
  const limiter = createRateLimiter({ maxRequestsPerMinute: 10 });
  const available = limiter.getAvailableTokens('abc');
  assertEquals(available, 10);
  limiter.allowRequest('abc');
  assertEquals(limiter.getAvailableTokens('abc'), 9);
});

Deno.test('mcp-gateway/gateway: createRateLimiter buckets are isolated per key', () => {
  const limiter = createRateLimiter({ maxRequestsPerMinute: 2 });
  assertEquals(limiter.allowRequest('k1'), true);
  assertEquals(limiter.allowRequest('k1'), true);
  assertEquals(limiter.allowRequest('k1'), false);
  assertEquals(limiter.allowRequest('k2'), true);
});

Deno.test('mcp-gateway/gateway: logAudit creates entry with id and timestamp', () => {
  const entry = logAudit({
    serverId: 'srv-1',
    toolName: 'test_tool',
    clientId: 'agent-42',
    success: true,
    latencyMs: 100,
  });
  assertExists(entry.id);
  assertMatch(entry.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assertEquals(entry.serverId, 'srv-1');
  assertEquals(entry.toolName, 'test_tool');
  assertEquals(entry.success, true);
  assertEquals(entry.latencyMs, 100);
});

Deno.test('mcp-gateway/gateway: getAuditLogs returns recent entries', () => {
  logAudit({ serverId: 'srv-a', toolName: 'a', clientId: 'c', success: true, latencyMs: 5 });
  logAudit({ serverId: 'srv-a', toolName: 'b', clientId: 'c', success: false, latencyMs: 10 });

  const all = getAuditLogs(undefined, 10);
  assert(all.length >= 2);
});

Deno.test('mcp-gateway/gateway: getAuditLogs filters by serverId', () => {
  logAudit({ serverId: 'srv-x', toolName: 'x', clientId: 'c', success: true, latencyMs: 5 });
  logAudit({ serverId: 'srv-y', toolName: 'y', clientId: 'c', success: true, latencyMs: 5 });

  const srvX = getAuditLogs('srv-x', 10);
  for (const e of srvX) {
    assertEquals(e.serverId, 'srv-x');
  }
});

Deno.test('mcp-gateway/gateway: assessRiskLevel returns low for harmless tools', () => {
  assertEquals(assessRiskLevel('search', {}), 'low');
  assertEquals(assessRiskLevel('list', {}), 'low');
  assertEquals(assessRiskLevel('read', {}), 'low');
});

Deno.test('mcp-gateway/gateway: assessRiskLevel returns medium for write/delete/shell/exec', () => {
  assertEquals(assessRiskLevel('write_file', {}), 'medium');
  assertEquals(assessRiskLevel('delete', {}), 'medium');
  assertEquals(assessRiskLevel('shell', {}), 'medium');
  assertEquals(assessRiskLevel('exec_command', {}), 'medium');
});

Deno.test('mcp-gateway/gateway: assessRiskLevel returns high for dangerous patterns', () => {
  assertEquals(assessRiskLevel('kill_process', { pid: '123' }), 'high');
  assertEquals(assessRiskLevel('format_disk', {}), 'high');
  assertEquals(assessRiskLevel('shutdown', {}), 'high');
  assertEquals(assessRiskLevel('terminate', {}), 'high');
  assertEquals(assessRiskLevel('run_sql', { query: 'DELETE FROM users' }), 'high');
});

Deno.test('mcp-gateway/gateway: assessRiskLevel returns critical for catastrophic patterns', () => {
  assertEquals(assessRiskLevel('run_sql', { query: 'TRUNCATE TABLE everything' }), 'critical');
  assertEquals(assessRiskLevel('run_sql', { query: 'DROP DATABASE production' }), 'critical');
  assertEquals(assessRiskLevel('exec_cmd', { cmd: 'rm -rf /' }), 'critical');
});

Deno.test('mcp-gateway/gateway: createApproval generates unique id and sets pending', () => {
  const req = createApproval('srv-1', 'delete', { path: '/tmp/x' }, 'agent-1');
  assertMatch(req.id, /^gw-apr_/);
  assertEquals(req.serverId, 'srv-1');
  assertEquals(req.toolName, 'delete');
  assertEquals(req.status, 'pending');
  assertEquals(req.requestedBy, 'agent-1');
});

Deno.test('mcp-gateway/gateway: createApproval uses provided riskLevel', () => {
  const req = createApproval('srv-1', 'read', {}, 'agent', 'critical');
  assertEquals(req.riskLevel, 'critical');
});

Deno.test('mcp-gateway/gateway: approveGatewayRequest transitions status', () => {
  const req = createApproval('srv-1', 'test', {}, 'agent');
  const result = approveGatewayRequest(req.id, 'admin', 'approved ok');
  assertEquals(result, true);

  const fetched = getGatewayApproval(req.id);
  assertExists(fetched);
  assertEquals(fetched.status, 'approved');
  assertEquals(fetched.reviewedBy, 'admin');
  assertEquals(fetched.reason, 'approved ok');
  assertExists(fetched.reviewedAt);
});

Deno.test('mcp-gateway/gateway: approveGatewayRequest fails for non-pending', () => {
  const req = createApproval('srv-1', 'test', {}, 'agent');
  approveGatewayRequest(req.id, 'admin');
  const retry = approveGatewayRequest(req.id, 'admin2');
  assertEquals(retry, false);
});

Deno.test('mcp-gateway/gateway: approveGatewayRequest fails for missing id', () => {
  assertEquals(approveGatewayRequest('nonexistent', 'admin'), false);
});

Deno.test('mcp-gateway/gateway: denyGatewayRequest transitions status', () => {
  const req = createApproval('srv-1', 'test', {}, 'agent');
  const result = denyGatewayRequest(req.id, 'admin', 'too risky');
  assertEquals(result, true);

  const fetched = getGatewayApproval(req.id)!;
  assertEquals(fetched.status, 'denied');
  assertEquals(fetched.reason, 'too risky');
});

Deno.test('mcp-gateway/gateway: denyGatewayRequest fails for non-pending', () => {
  const req = createApproval('srv-1', 'test', {}, 'agent');
  denyGatewayRequest(req.id, 'admin');
  assertEquals(denyGatewayRequest(req.id, 'admin2'), false);
});

Deno.test('mcp-gateway/gateway: getPendingGatewayApprovals returns only pending', () => {
  const r1 = createApproval('srv-1', 't1', {}, 'agent');
  const r2 = createApproval('srv-1', 't2', {}, 'agent');
  denyGatewayRequest(r1.id, 'admin');

  const pending = getPendingGatewayApprovals();
  assert(pending.length >= 1);
  for (const p of pending) {
    assertEquals(p.status, 'pending');
  }
});

Deno.test('mcp-gateway/gateway: getPendingGatewayApprovals filters by serverId', () => {
  const r1 = createApproval('srv-a', 't1', {}, 'agent');
  const r2 = createApproval('srv-b', 't2', {}, 'agent');

  const srvA = getPendingGatewayApprovals('srv-a');
  for (const p of srvA) {
    assertEquals(p.serverId, 'srv-a');
  }
});

Deno.test('mcp-gateway/gateway: getGatewayApproval returns undefined for missing', () => {
  assertEquals(getGatewayApproval('no-such-id'), undefined);
});

// ── MCP Server JSON-RPC ─────────────────────────────────────────────────
import { handleMcpHttpRequest } from '../src/mcp/server.ts';

function makeJsonRpc(method: string, params?: Record<string, unknown>): Request {
  return new Request('http://localhost/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
}

Deno.test('mcp/server: initialize returns protocol version and capabilities', async () => {
  const resp = await handleMcpHttpRequest(makeJsonRpc('initialize'));
  assertExists(resp);
  const body = await resp!.json();
  assertEquals(body.jsonrpc, '2.0');
  assertEquals(body.id, 1);
  assertEquals(body.result.protocolVersion, '2024-11-05');
  assertExists(body.result.capabilities.tools);
  assertEquals(body.result.serverInfo.name, 'cortex');
});

Deno.test('mcp/server: tools/list returns tool definitions', async () => {
  const resp = await handleMcpHttpRequest(makeJsonRpc('tools/list'));
  assertExists(resp);
  const body = await resp!.json();
  assertExists(body.result.tools);
  assert(Array.isArray(body.result.tools));
  assert(body.result.tools.length > 0);
  const builtins = body.result.tools.filter(
    (t: { name: string }) => t.name.startsWith('cortex.'),
  );
  assertGreater(builtins.length, 0);
});

Deno.test('mcp/server: tools/call with builtin health tool', async () => {
  const resp = await handleMcpHttpRequest(
    makeJsonRpc('tools/call', { name: 'cortex.health', arguments: {} }),
  );
  assertExists(resp);
  const body = await resp!.json();
  assertExists(body.result);
  const content = body.result.content;
  assert(Array.isArray(content));
  const text = JSON.parse(content[0].text);
  assertEquals(text.status, 'ok');
});

Deno.test('mcp/server: tools/call with builtin search_memory tool', async () => {
  const resp = await handleMcpHttpRequest(
    makeJsonRpc('tools/call', { name: 'cortex.search_memory', arguments: { query: 'test' } }),
  );
  assertExists(resp);
  const body = await resp!.json();
  assertExists(body.result);
  assertExists(body.result.content);
});

Deno.test('mcp/server: tools/call with builtin list_sessions tool', async () => {
  const resp = await handleMcpHttpRequest(
    makeJsonRpc('tools/call', {
      name: 'cortex.list_sessions',
      arguments: { limit: 5 },
    }),
  );
  assertExists(resp);
  const body = await resp!.json();
  assertExists(body.result);
  assertExists(body.result.content);
});

Deno.test('mcp/server: resources/list returns empty list', async () => {
  const resp = await handleMcpHttpRequest(makeJsonRpc('resources/list'));
  const body = await resp!.json();
  assertEquals(body.result.resources, []);
});

Deno.test('mcp/server: prompts/list returns empty list', async () => {
  const resp = await handleMcpHttpRequest(makeJsonRpc('prompts/list'));
  const body = await resp!.json();
  assertEquals(body.result.prompts, []);
});

Deno.test('mcp/server: unknown method returns error', async () => {
  const resp = await handleMcpHttpRequest(makeJsonRpc('invalid/method'));
  const body = await resp!.json();
  assertEquals(body.error.code, -32601);
  assertStringIncludes(body.error.message, 'Method not found');
});

Deno.test('mcp/server: tools/call with unknown tool returns error', async () => {
  const resp = await handleMcpHttpRequest(
    makeJsonRpc('tools/call', { name: 'nonexistent_tool', arguments: {} }),
  );
  const body = await resp!.json();
  assertEquals(body.error.code, -32000);
  assertStringIncludes(body.error.message, 'Tool not found');
});

Deno.test('mcp/server: tools/call missing name returns error', async () => {
  const resp = await handleMcpHttpRequest(makeJsonRpc('tools/call', { arguments: {} }));
  const body = await resp!.json();
  assertEquals(body.error.code, -32000);
});

Deno.test('mcp/server: GET /mcp returns tool list', async () => {
  const req = new Request('http://localhost/mcp');
  const resp = await handleMcpHttpRequest(req);
  assertExists(resp);
  assertEquals(resp!.status, 200);
  const body = await resp!.json();
  assert(Array.isArray(body.tools));
  assert(body.tools.length > 0);
});

Deno.test('mcp/server: returns null for unknown path', async () => {
  const req = new Request('http://localhost/unknown');
  const resp = await handleMcpHttpRequest(req);
  assertEquals(resp, null);
});

Deno.test('mcp/server: POST with malformed JSON returns parse error', async () => {
  const req = new Request('http://localhost/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not json',
  });
  const resp = await handleMcpHttpRequest(req);
  assertExists(resp);
  assertEquals(resp!.status, 400);
});

// ── MCP Client Types ────────────────────────────────────────────────────
import type { McpConnectionConfig, McpToolDef } from '../src/mcp/client.ts';
import { getConnection, listConnections } from '../src/mcp/client.ts';

Deno.test('mcp/client: listConnections returns array', () => {
  const conns = listConnections();
  assert(Array.isArray(conns));
});

Deno.test('mcp/client: getConnection returns undefined for unknown', () => {
  const conn = getConnection('nonexistent-client-test');
  assertEquals(conn, undefined);
});

Deno.test('mcp/client: McpConnectionConfig type is constructable', () => {
  const config: McpConnectionConfig = {
    name: 'test-cfg',
    transport: 'http',
    url: 'http://example.com/mcp',
  };
  assertEquals(config.name, 'test-cfg');
  assertEquals(config.transport, 'http');
  assertEquals(config.url, 'http://example.com/mcp');
});

Deno.test('mcp/client: McpToolDef type is constructable', () => {
  const tool: McpToolDef = {
    name: 'test_tool',
    description: 'A test tool',
    inputSchema: { type: 'object', properties: { x: { type: 'string' } } },
  };
  assertEquals(tool.name, 'test_tool');
  assertEquals(tool.description, 'A test tool');
  assertEquals(tool.inputSchema.type, 'object');
});

// ── Gateway Types ───────────────────────────────────────────────────────
import type {
  ApprovalRequest,
  AuditLogEntry,
  GatewayConfig,
  HealthCheckResult,
  RateLimitConfig,
} from '../src/mcp-gateway/types.ts';

Deno.test('mcp-gateway/types: McpServerEntry with all fields', () => {
  const entry: McpServerEntry = {
    id: 'srv-1',
    name: 'Test Server',
    endpoint: 'http://localhost:9000',
    transport: 'http',
    status: 'healthy',
    lastHealthCheck: '2026-01-01T00:00:00Z',
    authType: 'bearer',
    authConfig: { token: 'abc' },
    tools: ['tool1', 'tool2'],
    toolCount: 2,
    rateLimit: { maxRequestsPerMinute: 60 },
    tags: ['production'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
  assertEquals(entry.id, 'srv-1');
  assertEquals(entry.authType, 'bearer');
  assertEquals(entry.rateLimit!.maxRequestsPerMinute, 60);
});

Deno.test('mcp-gateway/types: ApprovalRequest with all fields', () => {
  const req: ApprovalRequest = {
    id: 'apr-1',
    serverId: 'srv-1',
    toolName: 'delete',
    args: { path: '/tmp' },
    riskLevel: 'high',
    requestedBy: 'agent-1',
    requestedAt: '2026-01-01T00:00:00Z',
    status: 'pending',
  };
  assertEquals(req.riskLevel, 'high');
  assertEquals(req.status, 'pending');
});

Deno.test('mcp-gateway/types: GatewayConfig with defaults', () => {
  const config: GatewayConfig = {
    enabled: true,
    defaultRateLimit: { maxRequestsPerMinute: 100 },
    auditEnabled: true,
    approvalRequiredForRisk: ['high', 'critical'],
  };
  assertEquals(config.enabled, true);
  assertEquals(config.auditEnabled, true);
  assertEquals(config.approvalRequiredForRisk!.length, 2);
});

Deno.test('mcp-gateway/types: HealthCheckResult type', () => {
  const result: HealthCheckResult = {
    serverId: 'srv-1',
    status: 'healthy',
    latencyMs: 42,
    toolCount: 5,
    checkedAt: '2026-01-01T00:00:00Z',
  };
  assertEquals(result.status, 'healthy');
  assertEquals(result.latencyMs, 42);
});

Deno.test('mcp-gateway/types: AuditLogEntry type', () => {
  const entry: AuditLogEntry = {
    id: 'audit-1',
    timestamp: '2026-01-01T00:00:00Z',
    serverId: 'srv-1',
    toolName: 'search',
    clientId: 'client-1',
    success: true,
    latencyMs: 10,
    tokensUsed: 150,
  };
  assertEquals(entry.success, true);
  assertEquals(entry.tokensUsed, 150);
});

Deno.test('mcp-gateway/types: RateLimitConfig type', () => {
  const config: RateLimitConfig = {
    maxRequestsPerMinute: 500,
    maxTokensPerRequest: 10000,
    burstSize: 20,
  };
  assertEquals(config.maxRequestsPerMinute, 500);
  assertEquals(config.maxTokensPerRequest, 10000);
  assertEquals(config.burstSize, 20);
});

// ── Mod barrel exports ──────────────────────────────────────────────────
import {
  createApproval as createApprovalFromMod,
  getPendingGatewayApprovals as getPendingFromMod,
  getServer as getServerFromMod,
  listServers as listServersFromMod,
  registerServer as registerServerFromMod,
} from '../src/mcp-gateway/mod.ts';

Deno.test('mcp-gateway/mod: barrel exports are functional', async () => {
  const entry = makeEntry({ id: 'mod-test', name: 'barrel-test' });
  await registerServerFromMod(entry);
  const found = await getServerFromMod('mod-test');
  assertExists(found);
  assertEquals(found.name, 'barrel-test');
});

// ── Health check — stdio returns unknown ────────────────────────────────
import { healthCheck } from '../src/mcp-gateway/gateway.ts';

Deno.test('mcp-gateway/gateway: healthCheck returns unknown for stdio transport', async () => {
  const stdioServer: McpServerEntry = {
    id: 'stdio-health',
    name: 'stdio-server',
    endpoint: '/usr/local/bin/my-mcp',
    transport: 'stdio',
    status: 'healthy',
    lastHealthCheck: new Date().toISOString(),
    tools: ['a', 'b'],
    toolCount: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const result = await healthCheck(stdioServer);
  assertEquals(result.status, 'unknown');
  assertEquals(result.toolCount, 0);
  assertStringIncludes(result.error ?? '', 'Stdio health checks not supported');
});
