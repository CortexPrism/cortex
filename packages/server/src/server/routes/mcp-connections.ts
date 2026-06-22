import { err, json, notFound, type RouteHandler } from './_helpers.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/mcp\/connections$/,
    handler: async () => {
      const { listConnections } = await import('../../mcp/client.ts');
      return json(
        listConnections().map((c) => ({
          name: c.config.name,
          config: c.config,
          connected: c.connected,
          serverInfo: c.serverInfo,
          tools: c.tools.length,
          calls: c.calls,
          errors: c.errors,
        })),
      );
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/mcp\/connections\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/mcp\/connections\/([^/]+)$/);
      if (!m) return notFound();
      const { getConnection, disconnectStdio, disconnectHttp } = await import(
        '../../mcp/client.ts'
      );
      const conn = getConnection(m[1]);
      if (conn && conn.config.transport === 'http') await disconnectHttp(m[1]);
      else await disconnectStdio(m[1]);
      return json({ ok: true });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/mcp\/connections\/([^/]+)\/tools$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/mcp\/connections\/([^/]+)\/tools$/);
      if (!m) return notFound();
      const { getConnection } = await import('../../mcp/client.ts');
      const conn = getConnection(m[1]);
      return json(conn?.tools || []);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/mcp\/connections$/,
    handler: async (req) => {
      const body = await req.json() as {
        name: string;
        transport: string;
        command?: string;
        args?: string[];
        url?: string;
        autoConnect?: boolean;
      };
      if (!body.name) return err('name is required', 400);
      const config = {
        name: body.name,
        transport: body.transport as 'stdio' | 'http',
        command: body.command,
        args: body.args,
        url: body.url,
      };
      try {
        const conn = body.transport === 'http'
          ? await (await import('../../mcp/client.ts')).connectHttp(config)
          : await (await import('../../mcp/client.ts')).connectStdio(config);
        return json({ name: conn.config.name, connected: conn.connected }, 201);
      } catch (e) {
        return err((e as Error).message, 400);
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/mcp\/connections\/([^/]+)\/connect$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/mcp\/connections\/([^/]+)\/connect$/);
      if (!m) return notFound();
      const { getConnection, connectStdio, connectHttp } = await import('../../mcp/client.ts');
      const conn = getConnection(m[1]);
      if (!conn) return notFound('Connection not found');
      try {
        if (conn.config.transport === 'http') await connectHttp(conn.config);
        else await connectStdio(conn.config);
        return json({ ok: true });
      } catch (e) {
        return err((e as Error).message, 400);
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/mcp\/connections\/([^/]+)\/disconnect$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/mcp\/connections\/([^/]+)\/disconnect$/);
      if (!m) return notFound();
      try {
        const { getConnection, disconnectStdio, disconnectHttp } = await import(
          '../../mcp/client.ts'
        );
        const conn = getConnection(m[1]);
        if (conn && conn.config.transport === 'http') await disconnectHttp(m[1]);
        else await disconnectStdio(m[1]);
        return json({ ok: true });
      } catch (e) {
        return err((e as Error).message, 400);
      }
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/mcp\/server$/,
    handler: async () => {
      const port = parseInt(Deno.env.get('CORTEX_PORT') || Deno.env.get('PORT') || '0') || 0;
      return json({ running: true, port });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/mcp\/server\/start$/,
    handler: async () => json({ ok: true, running: true }),
  },
  {
    method: 'POST',
    pattern: /^\/api\/mcp\/server\/stop$/,
    handler: async () =>
      json({
        ok: true,
        running: true,
        note: 'MCP server runs in-process — use server restart to stop',
      }),
  },
  {
    method: 'GET',
    pattern: /^\/api\/mcp-gateway\/servers$/,
    handler: async () => {
      const { listServers } = await import('../../mcp-gateway/registry.ts');
      const servers = listServers().map((s) => ({
        id: s.id,
        name: s.name,
        endpoint: s.endpoint,
        transport: s.transport,
        status: s.status,
        toolCount: s.toolCount,
        lastHealthCheck: s.lastHealthCheck,
      }));
      const healthy = servers.filter((s) => s.status === 'healthy').length;
      const degraded = servers.filter((s) => s.status === 'degraded').length;
      return json({ servers, healthy, degraded });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/mcp-gateway\/health-retry$/,
    handler: async (req) => {
      const body = await req.json() as { serverId: string };
      if (!body.serverId) return err('serverId is required', 400);
      return json({ ok: true, serverId: body.serverId, message: 'Health re-check queued' });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/chrome-bridge\/status$/,
    handler: async () => {
      try {
        const { getConnection } = await import('../../mcp/client.ts');
        const conn = getConnection('chrome-bridge');
        return json({
          running: !!conn,
          connected: conn?.connected || false,
          serverInfo: conn?.serverInfo || null,
          tools: conn?.tools?.length || 0,
          calls: conn?.calls || 0,
          errors: conn?.errors || 0,
          toolNames: conn?.tools?.map((t) => t.name) || [],
        });
      } catch {
        return json({
          running: false,
          connected: false,
          serverInfo: null,
          tools: 0,
          calls: 0,
          errors: 0,
          toolNames: [],
        });
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/chrome-bridge\/start$/,
    handler: async () => {
      try {
        const config = {
          name: 'chrome-bridge',
          transport: 'stdio' as const,
          command: 'npx',
          args: ['-y', '@anthropic/chrome-bridge-mcp'],
        };
        await (await import('../../mcp/client.ts')).connectStdio(config);
        return json({ ok: true });
      } catch (e) {
        return err((e as Error).message, 400);
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/chrome-bridge\/stop$/,
    handler: async () => {
      try {
        await (await import('../../mcp/client.ts')).disconnectStdio('chrome-bridge');
        return json({ ok: true });
      } catch (e) {
        return err((e as Error).message, 400);
      }
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/chrome-bridge\/tools$/,
    handler: async () => {
      const { getConnection } = await import('../../mcp/client.ts');
      const conn = getConnection('chrome-bridge');
      return json(conn?.tools || []);
    },
  },
];
