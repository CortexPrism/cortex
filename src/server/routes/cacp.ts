import { err, json, type RouteHandler } from './_helpers.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/cacp\/context$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const namespace = url.searchParams.get('namespace') || 'default';
      const { listSharedContext } = await import('../../memory/cross-agent-context.ts');
      return json(await listSharedContext(namespace));
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/cacp\/context$/,
    handler: async (req) => {
      const body = await req.json() as {
        namespace?: string;
        key: string;
        value: string;
        sessionId?: string;
      };
      if (!body.key) return err('key is required', 400);
      if (body.value === undefined) return err('value is required', 400);
      const { writeSharedContext } = await import('../../memory/cross-agent-context.ts');
      const ctx = await writeSharedContext(
        body.namespace || 'default',
        body.key,
        body.value,
        body.sessionId || 'api',
      );
      return json(ctx, 201);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/cacp\/conflicts$/,
    handler: async () => {
      const { getContextConflicts } = await import('../../memory/cross-agent-context.ts');
      return json(getContextConflicts());
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/cacp\/conflicts\/resolve$/,
    handler: async (req) => {
      const body = await req.json() as { key: string; acceptSessionId: string };
      const { resolveContextConflict } = await import('../../memory/cross-agent-context.ts');
      resolveContextConflict(body.key, body.acceptSessionId);
      return json({ ok: true });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/cacp\/links$/,
    handler: async () => {
      const { getLinkedSessions } = await import('../../memory/cross-agent-context.ts');
      return json(getLinkedSessions());
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/cacp\/links$/,
    handler: async (req) => {
      const body = await req.json() as { sessionIds: string[]; namespace?: string };
      if (!body.sessionIds || !body.sessionIds.length) return err('sessionIds is required', 400);
      const { linkSessions } = await import('../../memory/cross-agent-context.ts');
      const linked = linkSessions(body.sessionIds, body.namespace);
      return json(linked, 201);
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/cacp\/links\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/cacp\/links\/([^/]+)$/);
      if (!m) return err('Not found', 404);
      const { unlinkSessions } = await import('../../memory/cross-agent-context.ts');
      unlinkSessions(m[1]);
      return json({ ok: true });
    },
  },
];
