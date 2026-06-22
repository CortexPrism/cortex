import type { RouteHandler } from './_helpers.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/mcp/,
    handler: async (req) => {
      const { handleMcpHttpRequest } = await import('../../mcp/server.ts');
      const result = await handleMcpHttpRequest(req);
      if (result) return result;
      return null;
    },
  },
  {
    method: 'POST',
    pattern: /^\/mcp/,
    handler: async (req) => {
      const { handleMcpHttpRequest } = await import('../../mcp/server.ts');
      const result = await handleMcpHttpRequest(req);
      if (result) return result;
      return null;
    },
  },
];
