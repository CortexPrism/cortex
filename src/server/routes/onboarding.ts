import { json, type RouteHandler, savePartialProfile } from './_helpers.ts';
import { loadConfig, saveConfig } from '../../config/config.ts';
import type { CortexConfig, ProviderConfig, ProviderKind } from '../../config/config.ts';
import { generatePersonalitySoul } from '../../agent/soul.ts';
import { runMigrations } from '../../db/migrate.ts';
import { buildProviderFromConfig } from '../../llm/router.ts';
import { storeChannel, storeChannelCredentials } from '../../channels/store.ts';

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

      let connected = false;
      try {
        const provider = buildProviderFromConfig(kind, {
          kind,
          model: body.model,
          apiKey: body.apiKey,
          baseUrl: body.baseUrl,
        });
        const result = await provider.complete({
          messages: [{ role: 'user', content: 'Hi' }],
          model: body.model,
        });
        connected = result.content.length > 0;
      } catch {
        connected = false;
      }

      await saveConfig(config);
      return json({ success: true, connected });
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

      // Bridge: also persist to channels DB and vault
      if (body.credentials) {
        try {
          for (const [channel, creds] of Object.entries(body.credentials)) {
            if (channel === 'web') continue;
            const channelId = `onboarding-${channel}`;
            const vaultRef = await storeChannelCredentials(channelId, channel, creds);
            await storeChannel({
              id: channelId,
              channelType: channel,
              name: channel.charAt(0).toUpperCase() + channel.slice(1),
              enabled: true,
              settings: {},
              vaultRef,
              agentId: config.defaultAgent || 'assistant',
            });
          }
        } catch {
          // Non-critical: vault may not be available
        }
      }

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
          vectorStore: body.vectorStore as CortexConfig['memory'] extends { vectorStore: infer V }
            ? V
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
        startedAt: (cfg.onboarding as Record<string, unknown>)?.startedAt ||
          new Date().toISOString(),
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
      const kind = config.defaultProvider;
      const providerCfg = config.providers[kind];
      if (providerCfg?.apiKey || providerCfg?.baseUrl) {
        try {
          const provider = buildProviderFromConfig(kind, providerCfg);
          const result = await provider.complete({
            messages: [{
              role: 'system',
              content:
                'You are conducting a brief onboarding questionnaire for a new AI assistant user. Ask ONE conversational question to learn about the user - their work, interests, goals, or how they plan to use the assistant. Return ONLY valid JSON: {"question": "...", "questionId": "q1", "questionNumber": 1, "context": "..."}',
            }],
            model: providerCfg.model,
          });
          const parsed = JSON.parse(
            result.content.replace(/```json\n?/g, '').replace(/```/g, '').trim(),
          );
          return json({
            question: parsed.question,
            questionId: parsed.questionId || 'llm_1',
            questionNumber: 1,
          });
        } catch {
          // Fall back to hardcoded question
        }
      }
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
      const body = await req.json() as {
        questionId: string;
        answer: string;
        previousAnswers?: Record<string, string>;
      };
      try {
        const profile = await savePartialProfile(body.answer);
        const config = await loadConfig();
        const kind = config.defaultProvider;
        const providerCfg = config.providers[kind];
        const prevAnswers = body.previousAnswers || {};
        const allAnswers = { ...prevAnswers, [body.questionId]: body.answer };
        const answerCount = Object.keys(allAnswers).length;

        if (answerCount >= 3 || !providerCfg?.apiKey && !providerCfg?.baseUrl) {
          return json({ done: true, profile });
        }

        try {
          const provider = buildProviderFromConfig(kind, providerCfg);
          const qHistory = Object.entries(prevAnswers)
            .map(([q, a]) => `Q: ${q}\nA: ${a}`).join('\n');
          const result = await provider.complete({
            messages: [{
              role: 'system',
              content:
                `You are conducting a brief onboarding questionnaire. Previous answers:\n${qHistory}\nLatest answer: ${body.answer}\n\nAsk ONE more follow-up question OR say "done" if you have enough info. Return ONLY valid JSON: {"question": "...", "questionId": "q${
                  answerCount + 1
                }", "done": false} or {"done": true, "summary": "..."}`,
            }],
            model: providerCfg.model,
          });
          const parsed = JSON.parse(
            result.content.replace(/```json\n?/g, '').replace(/```/g, '').trim(),
          );
          if (parsed.done) {
            return json({ done: true, profile, nextQuestion: parsed.summary });
          }
          return json({
            done: false,
            nextQuestion: parsed.question,
            questionId: parsed.questionId || `llm_${answerCount + 1}`,
          });
        } catch {
          return json({ done: true, profile });
        }
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
