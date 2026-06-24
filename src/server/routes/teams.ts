import { err, json, notFound, type RouteHandler } from './_helpers.ts';
import { getIdentity } from './auth-guard.ts';
import { requireTeamAdmin, requireInstanceAdmin, requireTeamMember } from '../guards.ts';
import { getCoreDb } from '../../db/client.ts';
import type { InValue } from 'npm:@libsql/client';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/teams$/,
    handler: async (req) => {
      const identity = getIdentity(req);
      if (identity.type !== 'user') return json({ error: 'Authentication required' }, 401);
      const db = await getCoreDb();
      if (identity.isInstanceAdmin) {
        const all = await db.all<Record<string, unknown>>(
          `SELECT t.*, COUNT(tm.user_id) as member_count
           FROM teams t LEFT JOIN team_memberships tm ON t.id = tm.team_id
           GROUP BY t.id ORDER BY t.name`,
        );
        return json(all);
      }
      const teams = await db.all<Record<string, unknown>>(
        `SELECT t.*, COUNT(tm2.user_id) as member_count
         FROM teams t
         JOIN team_memberships tm ON t.id = tm.team_id
         LEFT JOIN team_memberships tm2 ON t.id = tm2.team_id
         WHERE tm.user_id = ?
         GROUP BY t.id ORDER BY t.name`,
        [identity.userId!],
      );
      return json(teams);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/teams$/,
    handler: async (req) => {
      const identity = getIdentity(req);
      if (identity.type !== 'user') return json({ error: 'Authentication required' }, 401);
      const guard = await requireInstanceAdmin(identity);
      if (guard) return guard;
      const body = await req.json() as {
        name: string;
        description?: string;
        joinPolicy?: string;
      };
      if (!body.name?.trim()) return json({ error: 'Team name required' }, 400);
      const db = await getCoreDb();
      const id = `team_${crypto.randomUUID()}`;
      await db.run(
        `INSERT INTO teams (id, name, description, join_policy, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [id, body.name.trim(), body.description ?? null, body.joinPolicy ?? 'closed', identity.userId!] as InValue[],
      );
      await db.run(
        `INSERT INTO team_memberships (user_id, team_id, role, joined_at)
         VALUES (?, ?, 'admin', datetime('now'))`,
        [identity.userId!, id],
      );
      return json({ id, name: body.name.trim() }, 201);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/teams\/([^/]+)$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/teams\/([^/]+)$/);
      if (!m) return notFound();
      const identity = getIdentity(req);
      if (identity.type !== 'user') return json({ error: 'Authentication required' }, 401);
      const db = await getCoreDb();
      const team = await db.get<Record<string, unknown>>(
        `SELECT * FROM teams WHERE id = ?`, [m[1]],
      );
      if (!team) return notFound('Team not found');
      const guard = await requireTeamMember(identity, m[1]);
      if (guard) return guard;
      const memberCount = await db.get<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM team_memberships WHERE team_id = ?`, [m[1]],
      );
      return json({ ...team, memberCount: memberCount?.cnt ?? 0 });
    },
  },
  {
    method: 'PATCH',
    pattern: /^\/api\/teams\/([^/]+)$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/teams\/([^/]+)$/);
      if (!m) return notFound();
      const identity = getIdentity(req);
      if (identity.type !== 'user') return json({ error: 'Authentication required' }, 401);
      const guard = await requireTeamAdmin(identity, m[1]);
      if (guard) return guard;
      const body = await req.json() as { name?: string; description?: string; join_policy?: string };
      const sets: string[] = [];
      const vals: InValue[] = [];
      if (body.name !== undefined) { sets.push('name = ?'); vals.push(body.name); }
      if (body.description !== undefined) { sets.push('description = ?'); vals.push(body.description); }
      if (body.join_policy !== undefined) { sets.push('join_policy = ?'); vals.push(body.join_policy); }
      if (sets.length === 0) return json({ error: 'No fields to update' }, 400);
      vals.push(m[1]);
      const db = await getCoreDb();
      await db.run(`UPDATE teams SET ${sets.join(', ')} WHERE id = ?`, vals);
      return json({ ok: true });
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/teams\/([^/]+)$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/teams\/([^/]+)$/);
      if (!m) return notFound();
      const identity = getIdentity(req);
      if (identity.type !== 'user') return json({ error: 'Authentication required' }, 401);
      const guard = await requireInstanceAdmin(identity);
      if (guard) return guard;
      const db = await getCoreDb();
      await db.run(`DELETE FROM team_memberships WHERE team_id = ?`, [m[1]]);
      await db.run(`DELETE FROM teams WHERE id = ?`, [m[1]]);
      return json({ ok: true });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/teams\/([^/]+)\/members$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/teams\/([^/]+)\/members$/);
      if (!m) return notFound();
      const identity = getIdentity(req);
      if (identity.type !== 'user') return json({ error: 'Authentication required' }, 401);
      const guard = await requireTeamMember(identity, m[1]);
      if (guard) return guard;
      const db = await getCoreDb();
      const members = await db.all(
        `SELECT u.id, u.username, u.display_name, tm.role, tm.joined_at
         FROM team_memberships tm JOIN users u ON tm.user_id = u.id
         WHERE tm.team_id = ? ORDER BY u.username`,
        [m[1]],
      );
      return json(members);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/teams\/([^/]+)\/members$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/teams\/([^/]+)\/members$/);
      if (!m) return notFound();
      const identity = getIdentity(req);
      if (identity.type !== 'user') return json({ error: 'Authentication required' }, 401);
      const guard = await requireTeamAdmin(identity, m[1]);
      if (guard) return guard;
      const body = await req.json() as { userId: string; role?: string };
      if (!body.userId) return json({ error: 'userId required' }, 400);
      const db = await getCoreDb();
      const user = await db.get<{ id: string }>(`SELECT id FROM users WHERE id = ?`, [body.userId]);
      if (!user) return json({ error: 'User not found' }, 404);
      await db.run(
        `INSERT OR REPLACE INTO team_memberships (user_id, team_id, role, joined_at)
         VALUES (?, ?, ?, datetime('now'))`,
        [body.userId, m[1], body.role ?? 'member'],
      );
      return json({ ok: true }, 201);
    },
  },
  {
    method: 'PATCH',
    pattern: /^\/api\/teams\/([^/]+)\/members\/([^/]+)$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/teams\/([^/]+)\/members\/([^/]+)$/);
      if (!m) return notFound();
      const teamId = m[1], userId = m[2];
      const identity = getIdentity(req);
      if (identity.type !== 'user') return json({ error: 'Authentication required' }, 401);
      const guard = await requireTeamAdmin(identity, teamId);
      if (guard) return guard;
      const body = await req.json() as { role?: string };
      if (!body.role) return json({ error: 'role required' }, 400);
      const db = await getCoreDb();
      await db.run(
        `UPDATE team_memberships SET role = ? WHERE team_id = ? AND user_id = ?`,
        [body.role, teamId, userId],
      );
      return json({ ok: true });
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/teams\/([^/]+)\/members\/([^/]+)$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/teams\/([^/]+)\/members\/([^/]+)$/);
      if (!m) return notFound();
      const teamId = m[1], userId = m[2];
      const identity = getIdentity(req);
      if (identity.type !== 'user') return json({ error: 'Authentication required' }, 401);
      const guard = await requireTeamAdmin(identity, teamId);
      if (guard) return guard;
      const db = await getCoreDb();
      await db.run(
        `DELETE FROM team_memberships WHERE team_id = ? AND user_id = ?`,
        [teamId, userId],
      );
      return json({ ok: true });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/teams\/([^/]+)\/agents$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/teams\/([^/]+)\/agents$/);
      if (!m) return notFound();
      const identity = getIdentity(req);
      if (identity.type !== 'user') return json({ error: 'Authentication required' }, 401);
      const guard = await requireTeamMember(identity, m[1]);
      if (guard) return guard;
      const { listAgents } = await import('../../agent/manager.ts');
      const agents = await listAgents(undefined, [m[1]]);
      return json(agents);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/teams\/([^/]+)\/agents$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/teams\/([^/]+)\/agents$/);
      if (!m) return notFound();
      const identity = getIdentity(req);
      if (identity.type !== 'user') return json({ error: 'Authentication required' }, 401);
      const guard = await requireTeamAdmin(identity, m[1]);
      if (guard) return guard;
      const { registerAgent } = await import('../../agent/manager.ts');
      const body = await req.json() as Record<string, unknown>;
      try {
        const agent = await registerAgent(body as Parameters<typeof registerAgent>[0], undefined, m[1]);
        return json(agent, 201);
      } catch (e) {
        return err((e as Error).message, 400);
      }
    },
  },
];
