import { type err, json, notFound, type RouteHandler } from './_helpers.ts';
import { getJob, listJobRuns, listJobs } from '../../../../infra/src/scheduler/scheduler.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/jobs$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const status = url.searchParams.get('status') as never ?? undefined;
      const jobs = await listJobs(status);
      return json(jobs);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/jobs\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/jobs\/([^/]+)$/);
      if (!m) return notFound();
      const job = await getJob(m[1]);
      if (!job) return notFound('Job not found');
      return json(job);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/jobs\/([^/]+)\/runs$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/jobs\/([^/]+)\/runs$/);
      if (!m) return notFound();
      const url = new URL(req.url);
      const limit = Number(url.searchParams.get('limit') ?? 20);
      const runs = await listJobRuns(
        m[1],
        Number.isFinite(limit) && limit > 0 ? limit : 20,
      );
      return json(runs);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/jobs\/recover$/,
    handler: async (req) => {
      const { recoverStaleJobs } = await import('../../../../infra/src/scheduler/scheduler.ts');
      const body = await req.json().catch(() => ({})) as { timeoutMs?: number };
      const result = await recoverStaleJobs(body.timeoutMs);
      return json(result);
    },
  },
];
