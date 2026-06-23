import { json, notFound, type RouteHandler } from './_helpers.ts';
import { getCoreDb } from '../../db/client.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/swarm\/topology$/,
    handler: async () => {
      const { getSwarmTopology } = await import(
        '../../packages/infra/src/swarm/remote-kernel.ts'
      ).catch(() => null as never);
      if (!getSwarmTopology) return json({ error: 'Swarm module not available' }, 503);
      try {
        const topology = await getSwarmTopology();
        return json(topology);
      } catch (e) {
        return json({ error: (e as Error).message }, 500);
      }
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/swarm\/report$/,
    handler: async () => {
      const { swarm } = await import(
        '../../packages/infra/src/swarm/coordinator.ts'
      ).catch(() => null as never);
      if (!swarm) return json({ error: 'Swarm module not available' }, 503);
      try {
        const report = await swarm.getResourceReport();
        return json(report);
      } catch (e) {
        return json({ error: (e as Error).message }, 500);
      }
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/swarm\/directives$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const limit = Number(url.searchParams.get('limit') ?? 50);
      const status = url.searchParams.get('status') ?? undefined;
      const db = await getCoreDb();

      let query = `SELECT * FROM swarm_directives`;
      const params: string[] = [];

      if (status) {
        query += ` WHERE status = ?`;
        params.push(status);
      }
      query += ` ORDER BY created_at DESC LIMIT ?`;
      params.push(String(limit));

      try {
        const rows = await db.all(query, params);
        return json(rows);
      } catch {
        return json([]);
      }
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/swarm\/nodes\/metrics$/,
    handler: async () => {
      const db = await getCoreDb();
      try {
        const rows = await db.all(
          `SELECT n.id, n.name, n.status, n.tier, n.group_name,
                  n.cpu_percent, n.memory_used_mb, n.memory_total_mb,
                  n.active_sessions, n.active_processes, n.a2a_endpoint,
                  n.labels, n.metrics_json, n.last_heartbeat
           FROM nodes n
           WHERE n.status = 'connected'
           ORDER BY n.name`,
        );
        return json(rows);
      } catch {
        return json([]);
      }
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/swarm\/nodes\/([^/]+)\/snapshots$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/swarm\/nodes\/([^/]+)\/snapshots$/);
      if (!m) return notFound();
      const db = await getCoreDb();
      try {
        const rows = await db.all(
          `SELECT * FROM swarm_resource_snapshots
           WHERE node_id = ?
           ORDER BY snapshot_at DESC
           LIMIT 50`,
          [m[1]],
        );
        return json(rows);
      } catch {
        return json([]);
      }
    },
  },
];
