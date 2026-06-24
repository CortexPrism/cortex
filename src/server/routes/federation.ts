import { json, notFound, type RouteHandler } from './_helpers.ts';
import { getIdentity } from './auth-guard.ts';
import { requireInstanceAdmin } from '../guards.ts';
import { getCoreDb } from '../../db/client.ts';
import type { InValue } from 'npm:@libsql/client';

export const routes: RouteHandler[] = [
  {
    method: 'POST',
    pattern: /^\/api\/federation\/generate-pairing-token$/,
    handler: async (req) => {
      const identity = getIdentity(req);
      if (identity.type !== 'user') return json({ error: 'Authentication required' }, 401);
      const guard = await requireInstanceAdmin(identity);
      if (guard) return guard;
      const token = `cortex_pair_${crypto.randomUUID()}`;
      const db = await getCoreDb();
      const id = `pair_${crypto.randomUUID()}`;
      await db.run(
        `INSERT INTO config (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [`pairing_token_${id}`, token],
      );
      return json({ id, token, expiresIn: '1 hour' });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/federation\/pair$/,
    handler: async (req) => {
      const identity = getIdentity(req);
      if (identity.type !== 'user') return json({ error: 'Authentication required' }, 401);
      const guard = await requireInstanceAdmin(identity);
      if (guard) return guard;
      const body = await req.json() as { endpoint: string; pairing_token: string; peer_name?: string };
      if (!body.endpoint || !body.pairing_token) {
        return json({ error: 'endpoint and pairing_token required' }, 400);
      }
      const peerName = body.peer_name || body.endpoint;
      const id = `peer_${crypto.randomUUID()}`;
      const db = await getCoreDb();
      await db.run(
        `INSERT INTO federation_peers (id, peer_name, endpoint, public_key, paired_at)
         VALUES (?, ?, ?, ?, datetime('now'))`,
        [id, peerName, body.endpoint, 'pending_verification'] as InValue[],
      );
      return json({ id, peerName, endpoint: body.endpoint }, 201);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/federation\/peers$/,
    handler: async (req) => {
      const identity = getIdentity(req);
      if (identity.type !== 'user') return json({ error: 'Authentication required' }, 401);
      const db = await getCoreDb();
      const peers = await db.all(
        `SELECT * FROM federation_peers WHERE revoked_at IS NULL ORDER BY paired_at DESC`,
      );
      return json(peers);
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/federation\/peers\/([^/]+)$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/federation\/peers\/([^/]+)$/);
      if (!m) return notFound();
      const identity = getIdentity(req);
      if (identity.type !== 'user') return json({ error: 'Authentication required' }, 401);
      const guard = await requireInstanceAdmin(identity);
      if (guard) return guard;
      const db = await getCoreDb();
      await db.run(
        `UPDATE federation_peers SET revoked_at = datetime('now') WHERE id = ?`,
        [m[1]],
      );
      return json({ ok: true });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/federation\/peers\/([^/]+)\/agents$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/federation\/peers\/([^/]+)\/agents$/);
      if (!m) return notFound();
      return json({ agents: [], note: 'Remote agent discovery pending' });
    },
  },
];
