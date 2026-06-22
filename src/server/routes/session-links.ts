import { json, type RouteHandler } from './_helpers.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/sessions\/links$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const sessionId = url.searchParams.get('sessionId');
      const { getLinkedSessions, getSessionLinks } = await import(
        '../../memory/cross-agent-context.ts'
      );
      return json(sessionId ? getSessionLinks(sessionId) : getLinkedSessions());
    },
  },
];
