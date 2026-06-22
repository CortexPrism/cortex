import { err, json, notFound, type RouteHandler } from './_helpers.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/triggers$/,
    handler: async () => {
      const { listTriggers } = await import('../../../../../src/triggers/manager.ts');
      return json(listTriggers());
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/triggers$/,
    handler: async (req) => {
      const body = await req.json();
      if (!body.name || typeof body.name !== 'string') {
        return err('name is required', 400);
      }
      if (/[^a-zA-Z0-9_-]/.test(body.name)) {
        return err('name may only contain letters, numbers, hyphens, and underscores', 400);
      }
      if (!body.action?.promptTemplate) {
        return err('action.promptTemplate is required', 400);
      }
      const { registerTrigger } = await import('../../../../../src/triggers/manager.ts');
      try {
        registerTrigger(body);
        return json({ ok: true }, 201);
      } catch (e) {
        return err((e as Error).message, 400);
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/triggers\/([^/]+)\/(enable|disable)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/triggers\/([^/]+)\/(enable|disable)$/);
      if (!m) return notFound();
      const { getTrigger } = await import('../../../../../src/triggers/manager.ts');
      const { startWatcher, stopWatcher } = await import('../../../../../src/triggers/watcher.ts');
      const config = getTrigger(m[1]);
      if (!config) return notFound('Trigger not found');
      const enabling = m[2] === 'enable';
      config.enabled = enabling;
      if (config.source === 'watcher') {
        if (enabling) {
          await startWatcher(config.name);
        } else {
          stopWatcher(config.name);
        }
      }
      return json({ ok: true, enabled: config.enabled });
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/triggers\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/triggers\/([^/]+)$/);
      if (!m) return notFound();
      const { unregisterTrigger } = await import('../../../../../src/triggers/manager.ts');
      const ok = unregisterTrigger(m[1]);
      return ok ? json({ ok: true }) : notFound('Trigger not found');
    },
  },
];
