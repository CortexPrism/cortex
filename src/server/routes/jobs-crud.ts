import { type RouteHandler, json } from './_helpers.ts';
import { cancelJob, createJob } from '../../scheduler/scheduler.ts';
import type { CreateJobOptions } from '../../scheduler/scheduler.ts';

export const routes: RouteHandler[] = [
  {
    method: 'POST',
    pattern: /^\/api\/jobs$/,
    handler: async (req) => {
      const body = await req.json() as CreateJobOptions & { runAt?: string };
      const opts: CreateJobOptions = {
        name: body.name,
        kind: body.kind ?? 'cron',
        schedule: body.schedule,
        command: body.command,
        maxAttempts: body.maxAttempts ?? 3,
        runAt: body.runAt ? new Date(body.runAt) : undefined,
        source: 'ui',
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
      const db = await (await import('../../db/client.ts')).getCoreDb();
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
      const { deleteJobsBatch } = await import('../../scheduler/scheduler.ts');
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
      const { deleteJobsByStatus } = await import('../../scheduler/scheduler.ts');
      await deleteJobsByStatus(
        m[1] as import('../../scheduler/scheduler.ts').JobStatus,
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
      const db = await (await import('../../db/client.ts')).getCoreDb();
      await db.run(`DELETE FROM jobs WHERE id=?`, [m[1]]);
      return json({ ok: true });
    },
  },
];
