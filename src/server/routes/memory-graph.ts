import { err, json, type RouteHandler } from './_helpers.ts';
import {
  findDuplicateEntities,
  getEntityDetail,
  getGraphData,
  mergeEntities,
  searchEntities,
  traverseGraph,
} from '../../memory/graph.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/memory\/graph\/entities$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const q = url.searchParams.get('q') ?? '';
      const entities = await searchEntities(q, q ? 20 : 50);
      return json(entities);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/memory\/graph$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const entity = url.searchParams.get('entity');
      if (!entity) return err('Missing query param: entity', 400);
      const depth = Number(url.searchParams.get('depth') ?? 2);
      const hits = await traverseGraph(entity, { depth, limit: 30 });
      return json(hits);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/memory\/graph\/full$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const entity = url.searchParams.get('entity') ?? undefined;
      const depth = Number(url.searchParams.get('depth') ?? 2);
      const limit = Number(url.searchParams.get('limit') ?? 200);
      const data = await getGraphData(entity, { depth, limit });
      return json(data);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/memory\/duplicates$/,
    handler: async () => {
      const duplicates = await findDuplicateEntities();
      return json(duplicates);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/memory\/merge$/,
    handler: async (req) => {
      const body = await req.json() as { sourceId: string; targetId: string };
      if (!body.sourceId || !body.targetId) return err('sourceId and targetId required', 400);
      await mergeEntities(body.sourceId, body.targetId);
      return json({ ok: true });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/memory\/graph\/entity$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const name = url.searchParams.get('name');
      if (!name) return err('Missing query param: name', 400);
      let decoded: string;
      try {
        decoded = decodeURIComponent(name);
      } catch {
        return err('Invalid name encoding', 400);
      }
      const type = url.searchParams.get('type') ?? undefined;
      const detail = await getEntityDetail(decoded, type);
      if (!detail) return err('Entity not found', 404);
      return json(detail);
    },
  },
];
