import { type RouteHandler, json, notFound, err } from './_helpers.ts';
import {
  deleteService,
  getRuntimeStatus,
  getService,
  listServices,
  registerService,
  startService,
  stopService,
  updateService,
} from '../../services/manager.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/services$/,
    handler: async () => {
      const services = await listServices();
      const runtime = await getRuntimeStatus();
      return json({ services, runtime });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/services\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/services\/([^/]+)$/);
      if (!m) return notFound();
      const svc = await getService(m[1]);
      if (!svc) return notFound('Service not found');
      const rt = (await getRuntimeStatus()).find((r) => r.id === m[1]);
      return json({ ...svc, runtime: rt ?? null });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/services$/,
    handler: async (req) => {
      const body = await req.json();
      try {
        const id = await registerService(body);
        return json({ ok: true, id }, 201);
      } catch (e) {
        return err((e as Error).message, 400);
      }
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/services\/([^/]+)$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/services\/([^/]+)$/);
      if (!m) return notFound();
      const body = await req.json();
      try {
        await updateService(m[1], body);
        return json({ ok: true });
      } catch (e) {
        return err((e as Error).message, 404);
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/services\/([^/]+)\/start$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/services\/([^/]+)\/start$/);
      if (!m) return notFound();
      try {
        await startService(m[1]);
        return json({ ok: true });
      } catch (e) {
        return err((e as Error).message, 400);
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/services\/([^/]+)\/stop$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/services\/([^/]+)\/stop$/);
      if (!m) return notFound();
      await stopService(m[1]);
      return json({ ok: true });
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/services\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/services\/([^/]+)$/);
      if (!m) return notFound();
      await deleteService(m[1]);
      return json({ ok: true });
    },
  },
];
