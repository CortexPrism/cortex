import { json, notFound, type RouteHandler } from './_helpers.ts';
import { getAgent } from '../../../../../src/agent/manager.ts';
import { loadConfig } from '../../../../../src/config/config.ts';

export const routes: RouteHandler[] = [
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
      await (await import('../../../../../src/config/config.ts')).saveConfig(config);
      return json({ ok: true });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/codegraph\/pilot-config$/,
    handler: async () => {
      const config = await loadConfig();
      const c = config as unknown as Record<string, unknown>;
      return json({
        pilotBudget: c.pilotBudget ?? 16384,
        pruningMode: c.pilotPruningMode ?? 'semantic',
        includeTests: c.pilotIncludeTests ?? false,
      });
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/codegraph\/pilot-config$/,
    handler: async (req) => {
      const body = await req.json() as {
        pilotBudget?: number;
        pruningMode?: string;
        includeTests?: boolean;
      };
      const config = await loadConfig();
      const c = config as unknown as Record<string, unknown>;
      if (body.pilotBudget !== undefined) c.pilotBudget = body.pilotBudget;
      if (body.pruningMode !== undefined) c.pilotPruningMode = body.pruningMode;
      if (body.includeTests !== undefined) c.pilotIncludeTests = body.includeTests;
      await (await import('../../../../../src/config/config.ts')).saveConfig(config);
      return json({ ok: true });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/agentlint\/check$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const { lintAgentConfig } = await import('../../../../../src/agent/agentlint.ts');
      const config = await loadConfig();
      const agentId = url.searchParams.get('agentId');
      let agentConfig;
      if (agentId) {
        const agent = await getAgent(agentId);
        if (!agent) return notFound('Agent not found');
        agentConfig = {
          name: agent.name,
          description: agent.description ?? `${agent.name} agent`,
          systemPrompt: agent.systemPrompt ?? '',
          tools: agent.tools ?? [],
          maxTurns: agent.maxTurns ?? config.agent.maxTurns,
          provider: agent.provider ?? config.defaultProvider,
          model: agent.model ?? config.providers[config.defaultProvider]?.model ?? 'unknown',
        };
      } else {
        agentConfig = {
          name: config.agent.name,
          description: `${config.agent.name} agent via ${config.defaultProvider}`,
          systemPrompt: 'CortexPrism agent prompt',
          tools: Object.keys(config.agents?.['assistant'] ?? {}),
          maxTurns: config.agent.maxTurns,
          provider: config.defaultProvider,
          model: config.providers[config.defaultProvider]?.model ?? 'unknown',
        };
      }
      const report = lintAgentConfig(agentConfig);
      return json({ report });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/sessions\/links$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const sessionId = url.searchParams.get('sessionId');
      const { getLinkedSessions, getSessionLinks } = await import(
        '../../../../../src/memory/cross-agent-context.ts'
      );
      return json(sessionId ? getSessionLinks(sessionId) : getLinkedSessions());
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/agent\/preferences$/,
    handler: async () => {
      const { generatePreferenceReport } = await import(
        '../../../../../src/memory/preference-learner.ts'
      );
      const report = await generatePreferenceReport();
      return json(report);
    },
  },
];
