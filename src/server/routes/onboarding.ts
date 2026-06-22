import { type RouteHandler, json, savePartialProfile } from './_helpers.ts';
import { loadConfig, saveConfig } from '../../config/config.ts';
import type { ProviderKind, ProviderConfig, CortexConfig } from '../../config/config.ts';
import { generatePersonalitySoul } from '../../agent/soul.ts';
import { runMigrations } from '../../db/migrate.ts';

export const routes: RouteHandler[] = [
  {
    method: 'POST',
    pattern: /^\/api\/onboarding\/provider$/,
    handler: async (req) => {
      const body = await req.json() as {
        kind: string;
        apiKey?: string;
        model: string;
        baseUrl?: string;
      };
      const config = await loadConfig();
      const kind = body.kind as ProviderKind;
      config.defaultProvider = kind;
      config.providers[kind] = {
        kind,
        model: body.model,
        apiKey: body.apiKey,
        baseUrl: body.baseUrl,
      } as ProviderConfig;
      await saveConfig(config);
      return json({ success: true, connected: true });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/onboarding\/personality$/,
    handler: async (req) => {
      const body = await req.json() as { personality: string; customSoul?: string };
      const { PATHS } = await import('../../config/paths.ts');
      const { ensureDir } = await import('@std/fs');
      if (body.personality !== 'custom') {
        const soul = generatePersonalitySoul(body.personality);
        await ensureDir(PATHS.configDir);
        await Deno.writeTextFile(PATHS.soulFile, soul);
      } else if (body.customSoul) {
        await ensureDir(PATHS.configDir);
        await Deno.writeTextFile(PATHS.soulFile, body.customSoul);
      }
      return json({ success: true });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/onboarding\/channels$/,
    handler: async (req) => {
      const body = await req.json() as {
        channels: string[];
        credentials?: Record<string, Record<string, string>>;
      };
      const config = await loadConfig();
      if (!config.plugins) config.plugins = {};
      config.plugins['channels'] = {
        enabled: body.channels,
        ...(body.credentials ? { credentials: body.credentials } : {}),
      };
      await saveConfig(config);
      return json({ success: true });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/onboarding\/advanced$/,
    handler: async (req) => {
      const body = await req.json() as Record<string, unknown>;
      const config = await loadConfig();
      if (body.embeddings) {
        config.embeddings = body.embeddings as CortexConfig['embeddings'];
      }
      if (body.vectorStore) {
        config.memory = {
          ...config.memory,
          vectorStore: body.vectorStore as CortexConfig['memory'] extends { vectorStore: infer V } ? V
            : never,
        };
      }
      if (body.chromeBridge) {
        config.chromeBridge = body.chromeBridge as CortexConfig['chromeBridge'];
      }
      if (body.voice) {
        config.voice = body.voice as CortexConfig['voice'];
      }
      await saveConfig(config);
      return json({ success: true });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/onboarding\/telemetry$/,
    handler: async (req) => {
      const body = await req.json() as { enabled: boolean };
      const config = await loadConfig();
      config.update = config.update ||
        {
          channel: 'stable',
          checkOnStartup: true,
          autoUpdate: false,
          checkIntervalHours: 24,
          githubToken: null,
          gpgKeyPath: null,
        };
      await saveConfig(config);
      return json({ success: true });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/onboarding\/complete$/,
    handler: async (req) => {
      const config = await loadConfig();
      const cfg = config as unknown as Record<string, unknown>;
      cfg.onboarding = {
        completed: true,
        completedAt: new Date().toISOString(),
        version: (await import('../../config/version.ts')).ONBOARDING_VERSION,
        skippedSteps: [],
      };
      await saveConfig(config);
      await runMigrations();
      return json({ success: true });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/onboarding\/progress$/,
    handler: async (req) => {
      const body = await req.json() as Record<string, unknown>;
      const config = await loadConfig();
      const cfg = config as unknown as Record<string, unknown>;
      cfg.onboarding = {
        ...(cfg.onboarding as Record<string, unknown> || {}),
        ...body,
        startedAt: (cfg.onboarding as Record<string, unknown>)?.startedAt || new Date().toISOString(),
      };
      await saveConfig(config);
      return json({ success: true });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/onboarding\/profile\/start$/,
    handler: async () => {
      const config = await loadConfig();
      return json({
        question: 'What do you do? (work, study, hobby projects, etc.)',
        questionId: 'intro_1',
        questionNumber: 1,
      });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/onboarding\/profile\/answer$/,
    handler: async (req) => {
      const body = await req.json() as { questionId: string; answer: string };
      try {
        const profile = await savePartialProfile(body.answer);
        return json({ done: true, profile });
      } catch {
        return json({ done: true });
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/onboarding\/profile\/skip$/,
    handler: async (req) => {
      const config = await loadConfig();
      const cfg = config as unknown as Record<string, unknown>;
      const onboarding = (cfg.onboarding as Record<string, unknown>) || {};
      (onboarding as Record<string, unknown>).skippedSteps = [
        ...((onboarding as Record<string, unknown>).skippedSteps as string[] || []),
        'personalization',
      ];
      cfg.onboarding = onboarding;
      await saveConfig(config);
      return json({ success: true });
    },
  },
];
