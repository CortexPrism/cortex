import { err, json, notFound, type RouteHandler } from './_helpers.ts';
import { getLensDb } from '../../../../../src/db/client.ts';
import { getPendingDirectives } from '../../hub/ws-node.ts';

export const routes: RouteHandler[] = [
  {
    method: 'POST',
    pattern: /^\/api\/nodes$/,
    handler: async (req) => {
      const body = await req.json() as {
        name: string;
        endpoint: string;
        tier?: string;
        capabilities?: string[];
        group?: string;
      };
      if (!body.name?.trim()) return err('Missing name', 400);
      if (!body.endpoint?.trim()) return err('Missing endpoint', 400);
      const { registerNode } = await import('../../hub/node-registry.ts');
      const result = await registerNode({
        name: body.name,
        endpoint: body.endpoint,
        tier: (body.tier as 'root' | 'sudo' | 'unprivileged') ?? 'unprivileged',
        capabilities: body.capabilities,
        group: body.group,
      });
      return json({ node: result.node, token: result.token }, 201);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/nodes\/groups$/,
    handler: async () => {
      const { nodeGroups } = await import('../../hub/node-registry.ts');
      return json(await nodeGroups());
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/nodes$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const group = url.searchParams.get('group') ?? undefined;
      const tier = url.searchParams.get('tier') ?? undefined;
      const status = url.searchParams.get('status') ?? undefined;
      const { listNodes } = await import('../../hub/node-registry.ts');
      const nodes = await listNodes({ group, tier: tier as never, status: status as never });
      return json(nodes);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/nodes\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/nodes\/([^/]+)$/);
      if (!m) return notFound();
      const { getNode } = await import('../../hub/node-registry.ts');
      const node = await getNode(m[1]);
      if (!node) return notFound('Node not found');
      return json(node);
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/nodes\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/nodes\/([^/]+)$/);
      if (!m) return notFound();
      const { deregisterNode } = await import('../../hub/node-registry.ts');
      const ok = await deregisterNode(m[1]);
      if (!ok) return notFound('Node not found');
      return json({ ok: true });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/nodes\/([^/]+)\/rekey$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/nodes\/([^/]+)\/rekey$/);
      if (!m) return notFound();
      const { rotateNodeToken } = await import('../../hub/node-registry.ts');
      const token = await rotateNodeToken(m[1]);
      if (!token) return notFound('Node not found');
      return json({ token });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/nodes\/([^/]+)\/metrics$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/nodes\/([^/]+)\/metrics$/);
      if (!m) return notFound();
      const url = new URL(req.url);
      const db = await getLensDb();
      const limit = Number(url.searchParams.get('limit') ?? 50);
      const rows = await db.all(
        `SELECT * FROM lens_events WHERE actor = ? AND event_type = 'node_heartbeat' ORDER BY started_at DESC LIMIT ?`,
        [m[1], limit],
      );
      return json(rows);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/nodes\/([^/]+)\/directives$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/nodes\/([^/]+)\/directives$/);
      if (!m) return notFound();
      const url = new URL(req.url);
      const db = await getLensDb();
      const limit = Number(url.searchParams.get('limit') ?? 50);
      const rows = await db.all(
        `SELECT * FROM lens_events WHERE actor = ? AND event_type = 'node_directive' ORDER BY started_at DESC LIMIT ?`,
        [m[1], limit],
      );
      return json(rows);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/remote\/agents$/,
    handler: async () => {
      const { listNodes } = await import('../../hub/node-registry.ts');
      const nodes = await listNodes();
      const agents = nodes.map((n) => ({
        id: n.id,
        name: n.name,
        nodeId: n.id,
        node: n.endpoint,
        tier: n.tier,
        status: n.status,
        capabilities: n.capabilities,
        lastHeartbeat: n.last_heartbeat,
        registeredAt: n.registered_at,
      }));
      return json(agents);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/remote\/directives$/,
    handler: async () => {
      const directives = getPendingDirectives();
      return json(directives);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/remote\/deploy$/,
    handler: async (req) => {
      const { getNode } = await import('../../hub/node-registry.ts');
      const { dispatchDirective } = await import('../../hub/ws-node.ts');
      const body = await req.json() as { agentId: string; nodeId: string; tier?: string };
      if (!body.agentId?.trim()) return err('Missing agentId', 400);
      if (!body.nodeId?.trim()) return err('Missing nodeId', 400);
      const node = await getNode(body.nodeId);
      if (!node) return notFound('Node not found');
      const directiveId = `dir_${Date.now().toString(36)}_${
        Math.random().toString(36).slice(2, 7)
      }`;
      const result = await dispatchDirective(body.nodeId, {
        id: directiveId,
        sessionId: body.agentId,
        action: 'deploy',
        params: { agentId: body.agentId, tier: body.tier ?? node.tier },
      });
      if (!result.dispatched) {
        return json({ ok: false, error: result.reason || 'Failed to dispatch' }, 409);
      }
      return json({ ok: true, directiveId });
    },
  },
];
