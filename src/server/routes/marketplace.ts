import { json, type RouteHandler } from './_helpers.ts';
import { enrichPluginVersions } from '../../plugins/update.ts';

const MARKETPLACE_BASE = 'https://cortexprism.io';

async function fetchMarketplace(
  path: string,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  try {
    const res = await fetch(`${MARKETPLACE_BASE}${path}`, {
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    const msg = (e as Error).message ?? 'Network error';
    const offline = msg.includes('connection refused') || msg.includes('network') ||
      msg.includes('ECONNREFUSED') || e instanceof DOMException;
    return {
      ok: false,
      status: offline ? 503 : 500,
      data: {
        error: offline
          ? 'Marketplace is currently unreachable. Check your internet connection.'
          : `Marketplace request failed: ${msg}`,
        offline,
      },
    };
  }
}

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/marketplace\/plugins$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const params = url.searchParams.toString();
      const { ok, status, data } = await fetchMarketplace(
        `/api/marketplace/plugins?${params}`,
      );
      if (ok && (data as Record<string, unknown>)?.plugins) {
        await enrichPluginVersions(
          (data as Record<string, unknown[]>).plugins as Record<string, unknown>[],
        ).catch(() => {});
      }
      return json(data, status);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/marketplace\/agents$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const params = url.searchParams.toString();
      const { status, data } = await fetchMarketplace(`/api/marketplace/agents?${params}`);
      return json(data, status);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/marketplace\/categories$/,
    handler: async () => {
      const { status, data } = await fetchMarketplace('/api/marketplace/categories');
      return json(data, status);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/marketplace\/stats$/,
    handler: async () => {
      const { status, data } = await fetchMarketplace('/api/marketplace/stats');
      return json(data, status);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/marketplace\/plugins\/([^/]+)\/install$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/marketplace\/plugins\/([^/]+)\/install$/);
      if (!m) return json({ error: 'Not found' }, 404);
      const slug = m[1];
      const dlRes = await fetch(`${MARKETPLACE_BASE}/api/marketplace/plugins/${slug}/download`);
      if (!dlRes.ok) return json({ error: `Plugin "${slug}" not found` }, 404);
      const manifest = await dlRes.json() as {
        name: string;
        version: string;
        description?: string;
        kind: string;
        entryPoint: string;
        capabilities?: string[];
        author?: string;
        homepage?: string;
        runtime?: string;
        license?: string;
        hash?: string;
      };
      const { installFromMarketplace } = await import('../../plugins/install.ts');
      try {
        await installFromMarketplace(slug, new URL(MARKETPLACE_BASE).hostname, manifest);
        return json({ ok: true, name: manifest.name });
      } catch (e) {
        return json({ error: (e as Error).message }, 400);
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/marketplace\/agents\/([^/]+)\/import$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/marketplace\/agents\/([^/]+)\/import$/);
      if (!m) return json({ error: 'Not found' }, 404);
      const slug = m[1];
      const dlRes = await fetch(`${MARKETPLACE_BASE}/api/marketplace/agents/${slug}/download`);
      if (!dlRes.ok) return json({ error: `Agent "${slug}" not found` }, 404);
      const data = await dlRes.json() as {
        name: string;
        description?: string;
        provider?: string;
        model?: string;
        temperature?: number;
        tools?: string[];
        tags?: string[];
        systemPrompt?: string;
        soulContent?: string;
      };
      if (!data.name) return json({ error: 'Invalid agent config: missing name' }, 400);
      const { registerAgent } = await import('../../agent/manager.ts');
      try {
        const agent = await registerAgent({
          name: data.name,
          description: data.description,
          provider: data.provider as never,
          model: data.model,
          temperature: data.temperature,
          soul: data.soulContent,
          systemPrompt: data.systemPrompt,
          tools: data.tools,
          tags: data.tags,
        });
        return json({ ok: true, name: agent.name, id: agent.id });
      } catch (e) {
        return json({ error: (e as Error).message }, 400);
      }
    },
  },
];
