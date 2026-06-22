import { type RouteHandler, json, err } from './_helpers.ts';
import { loadConfig } from '../../config/config.ts';
import { buildEmbedder } from '../../memory/embeddings.ts';
import { retrieve } from '../../memory/store.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/memory\/search$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const q = url.searchParams.get('q');
      if (!q) return err('Missing query param: q', 400);
      const config = await loadConfig();
      const embedder = buildEmbedder(config);
      const hits = await retrieve(q, embedder, { limit: 10 });
      return json(hits);
    },
  },
];
