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
];
