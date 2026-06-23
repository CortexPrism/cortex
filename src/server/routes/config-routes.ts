import { json, type RouteHandler } from './_helpers.ts';
import { loadConfig, saveConfig } from '../../config/config.ts';
import type { CortexConfig, LoggingConfig, ProviderKind } from '../../config/config.ts';
import { configureLogger } from '../../utils/logger.ts';
import { PATHS } from '../../config/paths.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/config$/,
    handler: async () => {
      const config = await loadConfig();
      const safe = JSON.parse(JSON.stringify(config)) as CortexConfig;
      for (const k of Object.keys(safe.providers)) {
        const p = safe.providers[k as keyof typeof safe.providers];
        if (p?.apiKey) p.apiKey = p.apiKey.slice(0, 6) + '...' + p.apiKey.slice(-4);
      }
      return json(safe);
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/config$/,
    handler: async (req) => {
      const body = await req.json() as Partial<CortexConfig>;
      const current = await loadConfig();
      const updated = { ...current, ...body } as Record<string, unknown>;
      if (body.logging && current.logging) {
        updated.logging = {
          ...current.logging,
          ...body.logging as unknown as Record<string, unknown>,
        };
      }
      const final = updated as unknown as CortexConfig;
      await saveConfig(final);
      if (body.logging) {
        const lc = { ...current.logging, ...body.logging } as unknown as LoggingConfig;
        configureLogger({
          level: (lc.level ?? 'error') as import('../../utils/logger.ts').LogLevel,
          fileEnabled: lc.fileEnabled !== false,
          filePath: lc.filePath ?? PATHS.logFile,
          fileMaxBytes: lc.fileMaxBytes,
          fileMaxFiles: lc.fileMaxFiles,
        });
      }
      return json({ ok: true });
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/config\/provider$/,
    handler: async (req) => {
      const body = await req.json() as {
        kind: string;
        model?: string;
        apiKey?: string;
        baseUrl?: string;
        secretKey?: string;
        temperature?: number;
        maxTokens?: number;
        topP?: number;
        reasoningEffort?: string;
        repetitionPenalty?: number;
        searchRecencyFilter?: string;
        returnCitations?: boolean;
        returnImages?: boolean;
        httpReferer?: string;
        xTitle?: string;
        numCtx?: number;
        numThread?: number;
        keepAlive?: string;
        dropParams?: boolean;
        includeVeniceSystemPrompt?: boolean;
        accountId?: string;
      };
      const config = await loadConfig();
      const kind = body.kind as keyof typeof config.providers;
      const existing = config.providers[kind] ?? { kind, model: '' } as never;
      config.providers[kind] = { ...existing, ...body } as never;
      await saveConfig(config);
      return json({ ok: true });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/settings\/compressor$/,
    handler: async () => {
      const config = await loadConfig();
      const c = config as unknown as Record<string, unknown>;
      return json({
        tokenBudget: c.tokenBudget ?? 128_000,
        compressionEnabled: c.compressionEnabled ?? true,
        compressionThreshold: c.compressionThreshold ?? 0.7,
      });
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/settings\/compressor$/,
    handler: async (req) => {
      const body = await req.json() as {
        tokenBudget?: number;
        compressionEnabled?: boolean;
        compressionThreshold?: number;
      };
      const config = await loadConfig();
      const c = config as unknown as Record<string, unknown>;
      if (body.tokenBudget !== undefined) c.tokenBudget = body.tokenBudget;
      if (body.compressionEnabled !== undefined) c.compressionEnabled = body.compressionEnabled;
      if (body.compressionThreshold !== undefined) {
        c.compressionThreshold = body.compressionThreshold;
      }
      await saveConfig(config);
      return json({ ok: true });
    },
  },
];
