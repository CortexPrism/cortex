import { err, json, type RouteHandler } from './_helpers.ts';
import { loadConfig } from '../../config/config.ts';
import type { ProviderKind } from '../../config/config.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/providers\/configured$/,
    handler: async () => {
      const config = await loadConfig();
      const configured = Object.entries(config.providers)
        .filter(([k, p]) => p && (p.apiKey || k === 'ollama'))
        .map(([k, p]) => ({ kind: k, model: p?.model || '' }));
      return json(configured);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/tools\/config$/,
    handler: async () => {
      const { vaultList, vaultGet } = await import('../../security/vault.ts');
      try {
        const entries = await vaultList();
        const toolConfigs: Record<string, { configured: boolean; masked?: string; url?: string }> =
          {};

        const knownTools = [
          'brave_search_api_key',
          'tavily_api_key',
          'firecrawl_api_key',
          'firecrawl_url',
          'serpapi_api_key',
        ];

        for (const toolKey of knownTools) {
          const entry = entries.find((e) => e.name === toolKey);
          if (entry) {
            try {
              const value = await vaultGet(toolKey);
              toolConfigs[toolKey] = {
                configured: true,
                masked: value.slice(0, 6) + '...' + value.slice(-4),
              };
            } catch {
              toolConfigs[toolKey] = { configured: false };
            }
          } else {
            const envKey = toolKey.toUpperCase();
            const envValue = Deno.env.get(envKey);
            if (envValue) {
              toolConfigs[toolKey] = {
                configured: true,
                masked: envValue.slice(0, 6) + '...' + envValue.slice(-4),
              };
            } else {
              toolConfigs[toolKey] = { configured: false };
            }
          }
        }

        return json(toolConfigs);
      } catch (e) {
        return err((e as Error).message, 500);
      }
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/tools\/config$/,
    handler: async (req) => {
      const body = await req.json() as {
        tool: string;
        value: string;
        service?: string;
      };

      if (!body.tool || !body.value) {
        return err('tool and value are required', 400);
      }

      const { vaultStore } = await import('../../security/vault.ts');
      try {
        await vaultStore({
          name: body.tool,
          service: body.service || 'tool',
          value: body.value,
          credentialType: 'api_key',
        });
        return json({ ok: true });
      } catch (e) {
        return err((e as Error).message, 500);
      }
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/tools\/config\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/tools\/config\/([^/]+)$/);
      if (!m) return err('Not found', 404);
      const toolName = m[1];
      const { vaultDelete } = await import('../../security/vault.ts');
      try {
        await vaultDelete(toolName);
        return json({ ok: true });
      } catch (e) {
        return err((e as Error).message, 500);
      }
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/providers\/(\w+)\/models$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/providers\/(\w+)\/models$/);
      if (!m) return err('Not found', 404);
      const kind = m[1] as ProviderKind;
      let apiKey: string | undefined;
      let baseUrl: string | undefined;
      if (req.method === 'POST') {
        const body = await req.json().catch(() => ({})) as { apiKey?: string; baseUrl?: string };
        apiKey = body.apiKey;
        baseUrl = body.baseUrl;
      }
      const { fetchModels } = await import('../models.ts');
      try {
        let models;
        if (apiKey) {
          models = await fetchModels(kind, apiKey, baseUrl);
        } else {
          const config = await loadConfig();
          const stored = config.providers[kind];
          if (!stored?.apiKey && kind !== 'ollama' && kind !== 'lmstudio') {
            return json([]);
          }
          models = await fetchModels(kind, stored?.apiKey ?? '', stored?.baseUrl ?? baseUrl);
        }
        return json(models);
      } catch (err) {
        return json([]);
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/providers\/(\w+)\/models$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/providers\/(\w+)\/models$/);
      if (!m) return err('Not found', 404);
      const kind = m[1] as ProviderKind;
      const body = await req.json().catch(() => ({})) as { apiKey?: string; baseUrl?: string };
      const apiKey = body.apiKey;
      const baseUrl = body.baseUrl;
      const { fetchModels } = await import('../models.ts');
      try {
        let models;
        if (apiKey) {
          models = await fetchModels(kind, apiKey, baseUrl);
        } else {
          const config = await loadConfig();
          const stored = config.providers[kind];
          if (!stored?.apiKey && kind !== 'ollama' && kind !== 'lmstudio') {
            return json([]);
          }
          models = await fetchModels(kind, stored?.apiKey ?? '', stored?.baseUrl ?? baseUrl);
        }
        return json(models);
      } catch (err) {
        return json([]);
      }
    },
  },
];
