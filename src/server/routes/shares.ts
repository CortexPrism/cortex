import { json, notFound, type RouteHandler } from './_helpers.ts';
import { getIdentity } from './auth-guard.ts';
import { getCoreDb } from '../../db/client.ts';
import { requireResourceOwner } from '../guards.ts';

export const routes: RouteHandler[] = [
  {
    method: 'POST',
    pattern: /^\/api\/shares$/,
    handler: async (req) => {
      const identity = getIdentity(req);
      if (identity.type !== 'user') return json({ error: 'Authentication required' }, 401);
      const body = await req.json() as {
        resource_type: string;
        resource_id: string;
        to_user_id: string;
        permission?: string;
      };
      if (!body.resource_type || !body.resource_id || !body.to_user_id) {
        return json({ error: 'resource_type, resource_id, and to_user_id required' }, 400);
      }
      const db = await getCoreDb();
      const recipient = await db.get<{ id: string }>(`SELECT id FROM users WHERE id = ?`, [body.to_user_id]);
      if (!recipient) return json({ error: 'Recipient user not found' }, 404);

      const ownerGuard = await requireResourceOwner(identity, body.resource_type, body.resource_id);
      if (ownerGuard) return ownerGuard;

      const id = `shr_${crypto.randomUUID()}`;
      await db.run(
        `INSERT OR IGNORE INTO resource_shares (id, resource_type, resource_id, from_user_id, to_user_id, permission)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          id,
          body.resource_type,
          body.resource_id,
          identity.userId!,
          body.to_user_id,
          body.permission ?? 'read',
        ],
      );
      return json({ id }, 201);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/shares\/given$/,
    handler: async (req) => {
      const identity = getIdentity(req);
      if (identity.type !== 'user') return json({ error: 'Authentication required' }, 401);
      const db = await getCoreDb();
      const shares = await db.all(
        `SELECT * FROM resource_shares WHERE from_user_id = ? ORDER BY created_at DESC`,
        [identity.userId!],
      );
      return json(shares);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/shares\/received$/,
    handler: async (req) => {
      const identity = getIdentity(req);
      if (identity.type !== 'user') return json({ error: 'Authentication required' }, 401);
      const db = await getCoreDb();
      const shares = await db.all(
        `SELECT rs.*, u.username as from_username
         FROM resource_shares rs JOIN users u ON rs.from_user_id = u.id
         WHERE rs.to_user_id = ? ORDER BY rs.created_at DESC`,
        [identity.userId!],
      );
      return json(shares);
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/shares\/([^/]+)$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/shares\/([^/]+)$/);
      if (!m) return notFound();
      const identity = getIdentity(req);
      if (identity.type !== 'user') return json({ error: 'Authentication required' }, 401);
      const db = await getCoreDb();
      const share = await db.get<{ from_user_id: string }>(
        `SELECT from_user_id FROM resource_shares WHERE id = ?`, [m[1]],
      );
      if (!share) return notFound('Share not found');
      if (share.from_user_id !== identity.userId && !identity.isInstanceAdmin) {
        return json({ error: 'Forbidden' }, 403);
      }
      await db.run(`DELETE FROM resource_shares WHERE id = ?`, [m[1]]);
      return json({ ok: true });
    },
  },
];
