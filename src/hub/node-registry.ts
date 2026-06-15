import { getCoreDb } from '../db/client.ts';
import { vaultDelete, vaultGet, vaultStore } from '../security/vault.ts';
import type { InValue } from 'npm:@libsql/client';

export type NodeTier = 'root' | 'sudo' | 'unprivileged';
export type NodeStatus = 'connecting' | 'connected' | 'disconnected' | 'error' | 'deregistered';

export interface NodeRecord {
  id: string;
  name: string;
  endpoint: string;
  tier: NodeTier;
  status: NodeStatus;
  capabilities: string[];
  version: string | null;
  group_name: string | null;
  last_heartbeat: string | null;
  last_processed_directive_id: string | null;
  registered_at: string;
  created_at: string;
  updated_at: string;
}

export interface NodeRegistration {
  name: string;
  endpoint: string;
  tier: NodeTier;
  capabilities?: string[];
  group?: string;
}

function nodeId(): string {
  return `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function tokenId(nodeId: string): string {
  return `node_token_${nodeId}`;
}

function generateToken(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

function parseRow(row: Record<string, unknown>): NodeRecord {
  let capabilities: string[] = [];
  try {
    capabilities = JSON.parse(String(row.capabilities ?? '[]'));
  } catch { /* keep default */ }

  return {
    id: String(row.id),
    name: String(row.name),
    endpoint: String(row.endpoint),
    tier: String(row.tier) as NodeTier,
    status: String(row.status) as NodeStatus,
    capabilities,
    version: row.version ? String(row.version) : null,
    group_name: row.group_name ? String(row.group_name) : null,
    last_heartbeat: row.last_heartbeat ? String(row.last_heartbeat) : null,
    last_processed_directive_id: row.last_processed_directive_id
      ? String(row.last_processed_directive_id)
      : null,
    registered_at: String(row.registered_at),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function registerNode(
  opts: NodeRegistration,
): Promise<{ node: NodeRecord; token: string }> {
  const db = await getCoreDb();
  const id = nodeId();
  const token = generateToken();
  const capabilities = JSON.stringify(opts.capabilities ?? []);
  const now = new Date().toISOString();

  await db.run(
    `INSERT INTO nodes (id, name, endpoint, tier, status, capabilities, group_name, registered_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'disconnected', ?, ?, ?, ?, ?)`,
    [
      id,
      opts.name,
      opts.endpoint,
      opts.tier,
      capabilities,
      opts.group ?? null,
      now,
      now,
      now,
    ] as InValue[],
  );

  await vaultStore({
    name: tokenId(id),
    service: 'nodes',
    value: token,
    credentialType: 'node_capability_token',
    allowedAgents: ['system'],
  });

  const node = await getNode(id);
  if (!node) throw new Error('Failed to create node record');

  return { node, token };
}

export async function getNode(id: string): Promise<NodeRecord | null> {
  const db = await getCoreDb();
  const row = await db.get<Record<string, unknown>>(
    `SELECT * FROM nodes WHERE id = ?`,
    [id],
  );
  if (!row) return null;
  return parseRow(row);
}

export async function listNodes(
  opts?: { group?: string; tier?: NodeTier; status?: NodeStatus },
): Promise<NodeRecord[]> {
  const db = await getCoreDb();
  let query = `SELECT * FROM nodes WHERE status != 'deregistered'`;
  const params: InValue[] = [];

  if (opts?.group) {
    query += ` AND group_name = ?`;
    params.push(opts.group);
  }
  if (opts?.tier) {
    query += ` AND tier = ?`;
    params.push(opts.tier);
  }
  if (opts?.status) {
    query += ` AND status = ?`;
    params.push(opts.status);
  }

  query += ` ORDER BY name ASC`;
  const rows = await db.all<Record<string, unknown>>(query, params);
  return rows.map(parseRow);
}

export async function updateNodeStatus(
  id: string,
  status: NodeStatus,
  heartbeat?: string,
): Promise<void> {
  const db = await getCoreDb();
  const now = new Date().toISOString();
  if (heartbeat) {
    await db.run(
      `UPDATE nodes SET status = ?, last_heartbeat = ?, updated_at = ? WHERE id = ?`,
      [status, heartbeat, now, id] as InValue[],
    );
  } else {
    await db.run(
      `UPDATE nodes SET status = ?, updated_at = ? WHERE id = ?`,
      [status, now, id] as InValue[],
    );
  }
}

export async function updateLastDirective(nodeId: string, directiveId: string): Promise<void> {
  const db = await getCoreDb();
  await db.run(
    `UPDATE nodes SET last_processed_directive_id = ?, updated_at = datetime('now') WHERE id = ?`,
    [directiveId, nodeId] as InValue[],
  );
}

export async function deregisterNode(id: string): Promise<boolean> {
  const db = await getCoreDb();
  const node = await getNode(id);
  if (!node) return false;

  await db.run(
    `UPDATE nodes SET status = 'deregistered', updated_at = datetime('now') WHERE id = ?`,
    [id],
  );

  try {
    await vaultDelete(tokenId(id));
  } catch { /* token may not exist */ }

  return true;
}

export async function getNodeToken(id: string): Promise<string | null> {
  try {
    return await vaultGet(tokenId(id), 'system');
  } catch {
    return null;
  }
}

export async function rotateNodeToken(id: string): Promise<string | null> {
  const node = await getNode(id);
  if (!node) return null;

  const newToken = generateToken();
  await vaultStore({
    name: tokenId(id),
    service: 'nodes',
    value: newToken,
    credentialType: 'node_capability_token',
    allowedAgents: ['system'],
  });

  return newToken;
}

export async function validateNodeToken(id: string, token: string): Promise<boolean> {
  try {
    const stored = await vaultGet(tokenId(id), 'system');
    return stored === token;
  } catch {
    return false;
  }
}

export async function getDisconnectedNodes(heartbeatTimeoutMs: number): Promise<NodeRecord[]> {
  const db = await getCoreDb();
  const cutoff = new Date(Date.now() - heartbeatTimeoutMs).toISOString();
  const rows = await db.all<Record<string, unknown>>(
    `SELECT * FROM nodes WHERE status = 'connected' AND last_heartbeat < ?`,
    [cutoff],
  );
  return rows.map(parseRow);
}

export async function nodeGroups(): Promise<string[]> {
  const db = await getCoreDb();
  const rows = await db.all<{ group_name: string }>(
    `SELECT DISTINCT group_name FROM nodes WHERE group_name IS NOT NULL AND status != 'deregistered' ORDER BY group_name`,
  );
  return rows.map((r) => r.group_name);
}
