import { json, notFound, type RouteHandler } from './_helpers.ts';
import {
  addPolicy,
  listPolicies,
  removePolicy as removePolicyDb,
  setPolicyEnabled,
  updatePolicy,
} from '../../../../../src/security/policy.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/policies$/,
    handler: async () => {
      const policies = await listPolicies();
      return json(policies);
    },
  },
  {
    method: 'PATCH',
    pattern: /^\/api\/policies\/([^/]+)$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/policies\/([^/]+)$/);
      if (!m) return notFound();
      const body = await req.json() as {
        kind?: string;
        effect?: string;
        pattern?: string;
        reason?: string;
        priority?: number;
      };
      const ok = await updatePolicy(m[1], body as any);
      if (ok) return json({ ok: true });
      return notFound('Policy not found');
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/policies\/([^/]+)\/toggle$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/policies\/([^/]+)\/toggle$/);
      if (!m) return notFound();
      const body = await req.json() as { enabled: boolean };
      const ok = await setPolicyEnabled(m[1], body.enabled);
      if (ok) return json({ ok: true });
      return notFound('Policy not found');
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/policies\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/policies\/([^/]+)$/);
      if (!m) return notFound();
      const ok = await removePolicyDb(m[1]);
      if (ok) return json({ ok: true });
      return notFound('Policy not found');
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/policies$/,
    handler: async (req) => {
      const body = await req.json() as {
        kind: string;
        effect: string;
        pattern: string;
        reason?: string;
        priority?: number;
      };
      const id = await addPolicy(body as any);
      return json({ ok: true, id });
    },
  },
];
