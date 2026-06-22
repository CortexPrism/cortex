import { json, type RouteHandler } from './_helpers.ts';
import { loadConfig, saveConfig } from '../../config/config.ts';
import type { ProviderKind } from '../../config/config.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/security\/supervisor$/,
    handler: async () => {
      const { selectSupervisorModel } = await import('../../security/supervisor.ts');
      const config = await loadConfig();
      const sel = await selectSupervisorModel();
      return json({
        provider: sel.provider,
        model: sel.model,
        cacheTTL: config.supervisor?.cacheTTL ?? 3600,
      });
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/security\/supervisor$/,
    handler: async (req) => {
      const body = await req.json() as { provider?: string; model?: string; cacheTTL?: number };
      const config = await loadConfig();
      const cur = config.supervisor || { provider: config.defaultProvider, model: 'gpt-4o-mini' };
      await saveConfig({
        ...config,
        supervisor: {
          provider: (body.provider || cur.provider) as ProviderKind,
          model: body.model || cur.model,
          cacheTTL: body.cacheTTL ?? cur.cacheTTL ?? 3600,
        },
      });
      return json({ ok: true });
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/security\/supervisor\/cache$/,
    handler: async () => {
      const { clearDecisionCache } = await import('../../security/supervisor.ts');
      clearDecisionCache();
      return json({ ok: true });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/security\/supervisor\/history$/,
    handler: async () => {
      const { getDecisionCacheEntries } = await import('../../security/supervisor.ts');
      const entries = getDecisionCacheEntries().map((e) => ({
        timestamp: e.expiresAt,
        allowed: e.allowed,
        tool: e.key.split(':')[1] || e.key,
      }));
      return json(entries);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/security\/approvals\/bulk$/,
    handler: async (req) => {
      const body = await req.json() as { requestIds: string[]; action: 'approve' | 'deny' };
      if (!body.requestIds || !body.requestIds.length) {
        return json({ error: 'requestIds required' }, 400);
      }
      const approved = body.action === 'approve';
      const results = body.requestIds.map((id) => ({
        id,
        action: body.action,
        resolved: approved,
      }));
      return json({ results });
    },
  },
];
