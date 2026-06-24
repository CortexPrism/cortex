import { getCoreDb } from '../db/client.ts';
import type { RequestIdentity } from './identity.ts';
import { json } from './routes/_helpers.ts';

export async function requireInstanceAdmin(
  identity: RequestIdentity,
): Promise<Response | null> {
  if (!identity.isInstanceAdmin) {
    return json({ error: 'Forbidden — instance admin required' }, 403);
  }
  return null;
}

export async function requireTeamAdmin(
  identity: RequestIdentity,
  teamId: string,
): Promise<Response | null> {
  if (identity.type !== 'user') {
    return json({ error: 'Authentication required' }, 401);
  }
  if (!identity.teamIds?.includes(teamId)) {
    return json({ error: 'Forbidden — not a member of this team' }, 403);
  }
  const db = await getCoreDb();
  const membership = await db.get<{ role: string }>(
    `SELECT role FROM team_memberships WHERE user_id = ? AND team_id = ?`,
    [identity.userId!, teamId],
  );
  if (!membership || membership.role !== 'admin') {
    if (identity.isInstanceAdmin) return null;
    return json({ error: 'Forbidden — team admin required' }, 403);
  }
  return null;
}

export async function requireTeamMember(
  identity: RequestIdentity,
  teamId: string,
): Promise<Response | null> {
  if (identity.type !== 'user') {
    return json({ error: 'Authentication required' }, 401);
  }
  if (identity.isInstanceAdmin) return null;
  if (!identity.teamIds?.includes(teamId)) {
    return json({ error: 'Forbidden — not a member of this team' }, 403);
  }
  return null;
}

export async function requireResourceOwner(
  identity: RequestIdentity,
  resourceType: string,
  resourceId: string,
): Promise<Response | null> {
  if (identity.type !== 'user') {
    return json({ error: 'Authentication required' }, 401);
  }
  if (identity.isInstanceAdmin) return null;

  const db = await getCoreDb();
  const table = resourceTypeToTable(resourceType);
  if (!table) return json({ error: 'Unknown resource type' }, 400);

  const row = await db.get<{ user_id: string | null }>(
    `SELECT user_id FROM ${table} WHERE id = ?`,
    [resourceId],
  );
  if (!row) return json({ error: 'Resource not found' }, 404);

  if (row.user_id && row.user_id !== identity.userId) {
    return json({ error: 'Forbidden — not the resource owner' }, 403);
  }
  return null;
}

function resourceTypeToTable(type: string): string | null {
  switch (type) {
    case 'agent':
      return 'agents';
    case 'session':
      return 'sessions';
    case 'service':
      return 'services';
    case 'node':
      return 'nodes';
    case 'channel':
      return 'channels';
    default:
      return null;
  }
}

export function getUserScopeFilter(
  identity: RequestIdentity,
): { user_id: string; team_ids: string[] } | null {
  if (identity.type !== 'user' || !identity.userId) return null;
  return {
    user_id: identity.userId,
    team_ids: identity.teamIds ?? [],
  };
}
