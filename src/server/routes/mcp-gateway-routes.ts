import { err, json, notFound, type RouteHandler } from './_helpers.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/mcp-gateway\/servers$/,
    handler: async () => {
      const { listServers } = await import('../../mcp-gateway/registry.ts');
      const { listConnections } = await import('../../mcp/client.ts');
      const activeNames = new Set(listConnections().map((c) => c.config.name));
      const servers = (await listServers()).map((s) => ({
        id: s.id,
        name: s.name,
        endpoint: s.endpoint,
        transport: s.transport,
        status: s.status,
        toolCount: s.toolCount,
        lastHealthCheck: s.lastHealthCheck,
        connected: activeNames.has(s.name),
      }));
      const healthy = servers.filter((s) => s.status === 'healthy').length;
      const degraded = servers.filter((s) => s.status === 'degraded').length;
      return json({ servers, healthy, degraded });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/mcp-gateway\/servers$/,
    handler: async (req) => {
      const body = await req.json() as {
        id?: string;
        name: string;
        endpoint: string;
        transport?: 'stdio' | 'http';
        tags?: string[];
      };
      if (!body.name) return err('name is required', 400);
      if (!body.endpoint) return err('endpoint is required', 400);
      const { registerServer } = await import('../../mcp-gateway/registry.ts');
      const entry = {
        id: body.id ?? crypto.randomUUID(),
        name: body.name,
        endpoint: body.endpoint,
        transport: body.transport ?? 'http',
        status: 'unknown' as const,
        lastHealthCheck: '',
        tools: [],
        toolCount: 0,
        tags: body.tags ?? [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await registerServer(entry);
      return json(entry, 201);
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/mcp-gateway\/servers\/([^/]+)$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/mcp-gateway\/servers\/([^/]+)$/);
      if (!m) return notFound();
      const id = m[1];
      const body = await req.json() as Partial<{
        name: string;
        endpoint: string;
        transport: 'stdio' | 'http';
        tags: string[];
      }>;
      const { getServer, updateServer } = await import('../../mcp-gateway/registry.ts');
      const existing = await getServer(id);
      if (!existing) return notFound('Server not found');
      const updated = await updateServer(id, body);
      return json(updated ?? { error: 'Update failed' }, updated ? 200 : 500);
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/mcp-gateway\/servers\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/mcp-gateway\/servers\/([^/]+)$/);
      if (!m) return notFound();
      const id = m[1];
      const { removeServer } = await import('../../mcp-gateway/registry.ts');
      const ok = await removeServer(id);
      if (!ok) return notFound('Server not found');
      return json({ ok: true });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/mcp-gateway\/servers\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/mcp-gateway\/servers\/([^/]+)$/);
      if (!m) return notFound();
      const id = m[1];
      const { getServer } = await import('../../mcp-gateway/registry.ts');
      const server = await getServer(id);
      if (!server) return notFound('Server not found');
      return json(server);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/mcp-gateway\/audit$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const serverId = url.searchParams.get('serverId') || undefined;
      const limit = parseInt(url.searchParams.get('limit') ?? '100');
      const { getAuditLogs } = await import('../../mcp-gateway/gateway.ts');
      return json(getAuditLogs(serverId, Math.min(limit, 500)));
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/mcp-gateway\/health-retry$/,
    handler: async (req) => {
      const body = await req.json() as { serverId: string };
      if (!body.serverId) return err('serverId is required', 400);
      const { getServer, updateServer } = await import('../../mcp-gateway/registry.ts');
      const { healthCheck } = await import('../../mcp-gateway/gateway.ts');
      const server = await getServer(body.serverId);
      if (!server) return notFound('Server not found');
      const result = await healthCheck(server);
      if (result.status !== server.status || result.toolCount !== server.toolCount) {
        await updateServer(body.serverId, {
          status: result.status,
          toolCount: result.toolCount,
          lastHealthCheck: result.checkedAt,
        } as Partial<import('../../mcp-gateway/types.ts').McpServerEntry>);
      }
      return json(result);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/mcp-gateway\/approvals$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const serverId = url.searchParams.get('serverId') || undefined;
      const { getPendingGatewayApprovals } = await import(
        '../../mcp-gateway/gateway.ts'
      );
      const approvals = await getPendingGatewayApprovals(serverId);
      return json(approvals);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/mcp-gateway\/approvals$/,
    handler: async (req) => {
      const body = await req.json() as {
        serverId: string;
        toolName: string;
        args?: Record<string, unknown>;
        requestedBy?: string;
        riskLevel?: 'low' | 'medium' | 'high' | 'critical';
      };
      if (!body.serverId) return err('Missing serverId', 400);
      if (!body.toolName) return err('Missing toolName', 400);
      const { createApproval } = await import('../../mcp-gateway/gateway.ts');
      const request = await createApproval(
        body.serverId,
        body.toolName,
        body.args ?? {},
        body.requestedBy ?? 'api',
        body.riskLevel,
      );
      return json({ ok: true, request }, 201);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/mcp-gateway\/approvals\/([^/]+)\/approve$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/mcp-gateway\/approvals\/([^/]+)\/approve$/);
      if (!m) return notFound();
      const id = m[1];
      const body = await req.json().catch(() => ({})) as { reviewedBy?: string; reason?: string };
      const { approveGatewayRequest } = await import('../../mcp-gateway/gateway.ts');
      const ok = await approveGatewayRequest(id, body.reviewedBy ?? 'api', body.reason);
      if (!ok) return err('Approval not found or not pending', 404);
      return json({ ok: true, id, status: 'approved' });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/mcp-gateway\/approvals\/([^/]+)\/deny$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/mcp-gateway\/approvals\/([^/]+)\/deny$/);
      if (!m) return notFound();
      const id = m[1];
      const body = await req.json().catch(() => ({})) as { reviewedBy?: string; reason?: string };
      const { denyGatewayRequest } = await import('../../mcp-gateway/gateway.ts');
      const ok = await denyGatewayRequest(id, body.reviewedBy ?? 'api', body.reason);
      if (!ok) return err('Approval not found or not pending', 404);
      return json({ ok: true, id, status: 'denied' });
    },
  },
];
