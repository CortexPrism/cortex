import { json, type RouteHandler } from './_helpers.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/(?:\.well-known\/(?:agent-card|a2a-agent-card)\.json|api\/a2a\/agent-card\.json)$/,
    handler: async (req) => {
      const { getA2AAgentCard } = await import('../../a2a/mod.ts');
      const url = new URL(req.url);
      const baseUrl = `${url.protocol}//${url.host}`;
      const card = await getA2AAgentCard(baseUrl, 'CortexPrism', 'CortexPrism AI Coding Agent');
      return json(card);
    },
  },
  {
    method: 'POST',
    pattern: /^\/(?:a2a|api\/a2a)$/,
    handler: async (req) => {
      const { handleA2ARequest } = await import('../../a2a/mod.ts');
      const body = await req.json() as Record<string, unknown>;
      const url = new URL(req.url);
      const baseUrl = `${url.protocol}//${url.host}`;
      return handleA2ARequest(body, baseUrl, 'CortexPrism', 'CortexPrism AI Coding Agent');
    },
  },
];
