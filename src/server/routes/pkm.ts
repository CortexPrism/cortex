import { err, json, type RouteHandler } from './_helpers.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/pkm$/,
    handler: async () => {
      const { listPkmConnections, getImportFormats } = await import('../../pkm-connectors.ts');
      return json({ connections: listPkmConnections(), formats: getImportFormats() });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/pkm\/connect$/,
    handler: async (req) => {
      const body = await req.json() as { kind: string; path: string; name?: string };
      if (!body.kind || !body.path) return err('kind and path required', 400);
      const { connectPkm } = await import('../../pkm-connectors.ts');
      const conn = connectPkm(
        body.kind as 'obsidian' | 'logseq' | 'notion' | 'roam',
        body.path,
        body.name || body.path,
      );
      return json(conn, 201);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/pkm\/sync$/,
    handler: async (req) => {
      const body = await req.json() as { id: string };
      if (!body.id) return err('id required', 400);
      const { syncPkm } = await import('../../pkm-connectors.ts');
      try {
        return json(await syncPkm(body.id));
      } catch (e) {
        return err((e as Error).message, 400);
      }
    },
  },
];
