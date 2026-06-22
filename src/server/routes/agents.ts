import { type RouteHandler, json, notFound, err } from './_helpers.ts';
import {
  deleteAgent,
  getAgent,
  listAgents,
  registerAgent,
  selectAgent,
  updateAgent,
} from '../../agent/manager.ts';
import { loadConfig } from '../../config/config.ts';
import type { AgentConfig } from '../../config/config.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/agents$/,
    handler: async () => {
      const agents = await listAgents();
      return json(agents);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/agents\/current$/,
    handler: async () => {
      const { getDefaultAgent } = await import('../../agent/manager.ts');
      const agent = await getDefaultAgent();
      const config = await loadConfig();
      return json({
        ...agent,
        isDefault: config.defaultAgent === agent.id,
        provider: config.defaultProvider,
        model: agent.model || config.providers[config.defaultProvider]?.model || 'unknown',
      });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/agents\/sub-types$/,
    handler: async () => {
      const { listSubAgentTypes } = await import('../../agent/sub-agent-types.ts');
      return json(listSubAgentTypes());
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/agents\/builtin$/,
    handler: async () => {
      const { getBuiltinAgentDefs } = await import('../../agent/builtin-agents.ts');
      return json(getBuiltinAgentDefs());
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/agents\/sub-types\/([^/]+)$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/agents\/sub-types\/([^/]+)$/);
      if (!m) return notFound();
      const body = await req.json() as {
        tools?: string[];
        model?: string;
        provider?: string;
        maxTurns?: number;
        systemPrompt?: string;
      };
      const { SUB_AGENT_TYPES } = await import('../../agent/sub-agent-types.ts');
      const name = m[1];
      const def = SUB_AGENT_TYPES[name as keyof typeof SUB_AGENT_TYPES];
      if (!def) return notFound('Sub-agent type not found');
      if (body.tools !== undefined) def.tools = body.tools;
      if (body.model !== undefined) def.model = body.model;
      if (body.provider !== undefined) def.provider = body.provider as unknown as undefined;
      if (body.maxTurns !== undefined) def.maxTurns = body.maxTurns;
      if (body.systemPrompt !== undefined) def.systemPrompt = body.systemPrompt;
      return json({ ok: true, type: def });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/agents\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/agents\/([^/]+)$/);
      if (!m) return notFound();
      if (m[1] === 'sub-types') return notFound('Use /api/agents/sub-types');
      const agent = await getAgent(m[1]);
      if (!agent) return notFound('Agent not found');
      return json(agent);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/agents\/([^/]+)\/identity$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/agents\/([^/]+)\/identity$/);
      if (!m) return notFound();
      const agent = await getAgent(m[1]);
      if (!agent) return notFound('Agent not found');
      const { loadAgentIdentity } = await import('../../agent/manager.ts');
      const identity = await loadAgentIdentity(agent);
      return json(identity);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/agents$/,
    handler: async (req) => {
      const body = await req.json() as Omit<AgentConfig, 'id' | 'createdAt' | 'updatedAt'> & {
        id?: string;
      };
      try {
        const agent = await registerAgent(body);
        return json(agent, 201);
      } catch (e) {
        return err((e as Error).message, 400);
      }
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/agents\/([^/]+)$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/agents\/([^/]+)$/);
      if (!m) return notFound();
      const body = await req.json() as Partial<Omit<AgentConfig, 'id' | 'createdAt'>>;
      try {
        const agent = await updateAgent(m[1], body);
        return json(agent);
      } catch (e) {
        return err((e as Error).message, 404);
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/agents\/([^/]+)\/select$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/agents\/([^/]+)\/select$/);
      if (!m) return notFound();
      try {
        await selectAgent(m[1]);
        return json({ ok: true });
      } catch (e) {
        return err((e as Error).message, 404);
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/agents\/([^/]+)\/clone$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/agents\/([^/]+)\/clone$/);
      if (!m) return notFound();
      const { cloneAgent } = await import('../../agent/manager.ts');
      const body = await req.json().catch(() => ({})) as { name?: string };
      const newName = body.name || m[1] + '-copy';
      try {
        const agent = await cloneAgent(m[1], newName);
        return json(agent, 201);
      } catch (e) {
        return err((e as Error).message, 400);
      }
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/agents\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/agents\/([^/]+)$/);
      if (!m) return notFound();
      try {
        await deleteAgent(m[1]);
        return json({ ok: true });
      } catch (e) {
        return err((e as Error).message, 400);
      }
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/processes\/sub-agents$/,
    handler: async () => {
      try {
        const cmd = new Deno.Command('ps', {
          args: ['-eo', 'pid,args'],
          stdout: 'piped',
          stderr: 'null',
        });
        const output = await cmd.output();
        const text = new TextDecoder().decode(output.stdout);
        const processes: Array<{ pid: number; cmd: string }> = [];
        for (const line of text.split('\n').slice(1)) {
          if (!line.trim()) continue;
          if (line.includes('sub-agent') || line.includes('sub_agent') || line.includes('subagent')) {
            const m2 = line.trim().match(/^(\d+)\s+(.+)$/);
            if (m2) processes.push({ pid: parseInt(m2[1]), cmd: m2[2] });
          }
        }
        return json({ processes });
      } catch {
        return json({ processes: [] });
      }
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/providers\/comparison$/,
    handler: async () => {
      const config = await loadConfig();
      const { PROVIDER_DEFAULT_CONTEXT_WINDOWS } = await import('../../llm/router.ts');
      const providers = Object.entries(config.providers).filter(([, c]) => c != null).map((
        [k, c],
      ) => ({
        kind: k,
        model: (c as { model?: string }).model || '',
        contextWindow:
          PROVIDER_DEFAULT_CONTEXT_WINDOWS[k as keyof typeof PROVIDER_DEFAULT_CONTEXT_WINDOWS] || 0,
      }));
      return json(providers);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/router\/history$/,
    handler: async () => json([]),
  },
];
