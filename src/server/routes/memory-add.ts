import { type RouteHandler, json, err } from './_helpers.ts';
import { writeEpisodic } from '../../memory/store.ts';

export const routes: RouteHandler[] = [
  {
    method: 'POST',
    pattern: /^\/api\/memory\/add$/,
    handler: async (req) => {
      const body = await req.json() as { content: string; type?: string; topics?: string[] };
      if (!body.content?.trim()) return err('Missing content', 400);
      await writeEpisodic({ summary: body.content, sessionId: 'web_manual', topics: body.topics });
      return json({ ok: true });
    },
  },
];
