import { json, notFound, type RouteHandler } from './_helpers.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/hooks$/,
    handler: async () => {
      const { listHooks } = await import('../../pipeline/manager.ts');
      return json(
        listHooks().map((r) => ({
          name: r.hook.name,
          stages: r.hook.stages,
          priority: r.hook.priority,
          async: r.hook.async,
          disableable: r.hook.disableable,
          source: r.source,
          pluginName: r.pluginName ?? null,
        })),
      );
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/hooks\/init$/,
    handler: async () => {
      const { registerBuiltinHooks } = await import('../../pipeline/builtin.ts');
      const { getHookCount } = await import('../../pipeline/manager.ts');
      const before = getHookCount();
      registerBuiltinHooks();
      const after = getHookCount();
      return json({ ok: true, added: after - before, total: after });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/hooks\/([^/]+)\/disable$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/hooks\/([^/]+)\/disable$/);
      if (!m) return notFound();
      const { unregisterHook } = await import('../../pipeline/manager.ts');
      const ok = unregisterHook(m[1]);
      return ok ? json({ ok: true }) : notFound('Hook not found');
    },
  },
];
