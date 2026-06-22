import { err, json, type RouteHandler } from './_helpers.ts';
import type { getLensDb, InValue } from '../../../../../src/db/client.ts';
import { normalize } from '@std/path';

async function applyUndo(agentId?: string): Promise<Response> {
  const db = await (await import('../../../../../src/db/client.ts')).getCoreDb();
  let query = `SELECT before_text, file_path FROM file_edit_log WHERE 1=1`;
  const params: InValue[] = [];
  if (agentId) {
    query += ` AND agent_id = ?`;
    params.push(agentId);
  }
  query += ` ORDER BY created_at DESC LIMIT 1`;
  const row = await db.get<{ before_text: string; file_path: string }>(query, params);
  if (!row) return err('No edits to undo', 404);
  const safePath = normalize(row.file_path);
  await Deno.writeTextFile(safePath, row.before_text);
  return json({ ok: true, path: safePath });
}

async function applyRedo(agentId?: string): Promise<Response> {
  const db = await (await import('../../../../../src/db/client.ts')).getCoreDb();
  let query = `SELECT after_text, file_path FROM file_edit_log WHERE tool = 'file_undo'`;
  const params: InValue[] = [];
  if (agentId) {
    query += ` AND agent_id = ?`;
    params.push(agentId);
  }
  query += ` ORDER BY created_at DESC LIMIT 1`;
  const row = await db.get<{ after_text: string; file_path: string }>(query, params);
  if (!row) return err('No edits to redo', 404);
  const safePath = normalize(row.file_path);
  await Deno.writeTextFile(safePath, row.after_text);
  return json({ ok: true, path: safePath });
}

export const routes: RouteHandler[] = [
  {
    method: 'POST',
    pattern: /^\/api\/workspace\/undo$/,
    handler: async () => {
      return await applyUndo();
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/workspace\/redo$/,
    handler: async () => {
      return await applyRedo();
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/workspace\/agents\/([^/]+)\/undo$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/workspace\/agents\/([^/]+)\/undo$/);
      if (!m) return err('Not found', 404);
      return await applyUndo(m[1]);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/workspace\/agents\/([^/]+)\/redo$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/workspace\/agents\/([^/]+)\/redo$/);
      if (!m) return err('Not found', 404);
      return await applyRedo(m[1]);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/workspace\/history$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const db = await (await import('../../../../../src/db/client.ts')).getCoreDb();
      const filePath = url.searchParams.get('path') ?? '';
      const agentId = url.searchParams.get('agentId') ?? '';
      const limit = Number(url.searchParams.get('limit') ?? 50);
      let query = `SELECT * FROM file_edit_log WHERE 1=1`;
      const params: string[] = [];
      if (filePath) {
        query += ` AND file_path = ?`;
        params.push(filePath);
      }
      if (agentId) {
        query += ` AND agent_id = ?`;
        params.push(agentId);
      }
      query += ` ORDER BY created_at DESC LIMIT ?`;
      params.push(String(limit));
      const rows = await db.all(query, params);
      return json(rows);
    },
  },
];
