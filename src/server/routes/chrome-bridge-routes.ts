import { err, json, type RouteHandler } from './_helpers.ts';

export const routes: RouteHandler[] = [
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
