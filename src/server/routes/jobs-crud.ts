import { json, type RouteHandler } from './_helpers.ts';
import { cancelJob, createJob } from '../../../packages/infra/src/scheduler/scheduler.ts';
import type { CreateJobOptions } from '../../../packages/infra/src/scheduler/scheduler.ts';

export const routes: RouteHandler[] = [
  {
    method: 'POST',
    pattern: /^\/api\/jobs$/,
    handler: async (req) => {
      const body = await req.json() as {
        name?: string;
        kind?: string;
        schedule?: string;
        command?: string;
        maxAttempts?: number;
        runAt?: string;
        description?: string;
        actionKind?: string;
        actionConfig?: Record<string, unknown>;
      };

      if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
        return json({ error: 'name is required' }, 400);
      }
      if (body.name.length > 200) {
        return json({ error: 'name must be 200 characters or fewer' }, 400);
      }

      const isAgentTurn = body.actionKind === 'agent_turn';
      const command = (body.command ?? '').trim();
      if (!command && !isAgentTurn) {
        return json({ error: 'command is required for shell jobs' }, 400);
      }

      const opts: CreateJobOptions = {
        name: body.name.trim(),
        kind: (body.kind as CreateJobOptions['kind']) ?? 'cron',
        schedule: body.schedule,
        command: command || 'agent-turn',
        maxAttempts: body.maxAttempts ?? 3,
        runAt: body.runAt ? new Date(body.runAt) : undefined,
        source: 'ui',
        description: body.description,
        actionKind: body.actionKind ?? 'shell',
        actionConfig: body.actionConfig ?? {},
      };
      const id = await createJob(opts);
      return json({ ok: true, id });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/jobs\/([^/]+)\/cancel$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/jobs\/([^/]+)\/cancel$/);
      if (!m) return json({ error: 'Not found' }, 404);
      await cancelJob(m[1]);
      return json({ ok: true });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/jobs\/([^/]+)\/trigger$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/jobs\/([^/]+)\/trigger$/);
      if (!m) return json({ error: 'Not found' }, 404);
      const db = await (await import('../../../db/client.ts')).getCoreDb();
      await db.run(
        `UPDATE jobs SET status='pending', next_run_at=datetime('now') WHERE id=?`,
        [m[1]],
      );
      return json({ ok: true });
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/jobs\/batch$/,
    handler: async (req) => {
      const body = await req.json() as { ids: string[] };
      const { deleteJobsBatch } = await import(
        '../../../packages/infra/src/scheduler/scheduler.ts'
      );
      await deleteJobsBatch(body.ids ?? []);
      return json({ ok: true });
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/jobs\/status\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/jobs\/status\/([^/]+)$/);
      if (!m) return json({ error: 'Not found' }, 404);
      const { deleteJobsByStatus } = await import(
        '../../../packages/infra/src/scheduler/scheduler.ts'
      );
      await deleteJobsByStatus(
        m[1] as import('../../../packages/infra/src/scheduler/scheduler.ts').JobStatus,
      );
      return json({ ok: true });
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/jobs\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/jobs\/([^/]+)$/);
      if (!m) return json({ error: 'Not found' }, 404);
      const db = await (await import('../../../db/client.ts')).getCoreDb();
      await db.run(`DELETE FROM jobs WHERE id=?`, [m[1]]);
      return json({ ok: true });
    },
  },
];
