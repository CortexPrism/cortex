/**
 * MCP Server Registry — CRUD operations for managed MCP servers.
 * Persists to cortex.db via mcp_gateway_servers table (migration 049).
 */
import { getCoreDb } from '../db/client.ts';
import type { Db } from '../db/client.ts';
import type { McpServerEntry } from './types.ts';

const memoryStore = new Map<string, McpServerEntry>();
let dbLoaded = false;

function toDbRow(entry: McpServerEntry) {
  return {
    id: entry.id,
    name: entry.name,
    endpoint: entry.endpoint,
    transport: entry.transport,
    status: entry.status,
    last_health_check: entry.lastHealthCheck,
    auth_type: entry.authType ?? null,
    auth_config_json: JSON.stringify(entry.authConfig ?? {}),
    tools_json: JSON.stringify(entry.tools),
    tool_count: entry.toolCount,
    rate_limit_json: entry.rateLimit ? JSON.stringify(entry.rateLimit) : null,
    tags_json: JSON.stringify(entry.tags ?? []),
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  };
}

function fromDbRow(row: Record<string, unknown>): McpServerEntry {
  return {
    id: row.id as string,
    name: row.name as string,
    endpoint: row.endpoint as string,
    transport: (row.transport as string) as 'stdio' | 'http',
    status: (row.status as string) as 'healthy' | 'degraded' | 'unhealthy' | 'unknown',
    lastHealthCheck: (row.last_health_check as string) ?? '',
    authType: (row.auth_type as McpServerEntry['authType']) ?? undefined,
    authConfig: typeof row.auth_config_json === 'string' ? JSON.parse(row.auth_config_json) : {},
    tools: typeof row.tools_json === 'string' ? JSON.parse(row.tools_json) : [],
    toolCount: (row.tool_count as number) ?? 0,
    rateLimit: row.rate_limit_json ? JSON.parse(row.rate_limit_json as string) : undefined,
    tags: typeof row.tags_json === 'string' ? JSON.parse(row.tags_json) : [],
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
    updatedAt: (row.updated_at as string) ?? new Date().toISOString(),
  };
}

async function getDb(): Promise<Db | null> {
  try {
    return await getCoreDb();
  } catch {
    return null;
  }
}

async function loadIntoMemory(): Promise<void> {
  if (dbLoaded) return;
  const db = await getDb();
  if (!db) {
    dbLoaded = true;
    return;
  }
  try {
    const rows = await db.all<Record<string, unknown>>(
      'SELECT * FROM mcp_gateway_servers ORDER BY name',
    );
    for (const row of rows) {
      memoryStore.set(row.id as string, fromDbRow(row));
    }
  } catch {
    // table may not exist yet (pre-migration)
  }
  dbLoaded = true;
}

export async function registerServer(entry: McpServerEntry): Promise<void> {
  await loadIntoMemory();
  entry.updatedAt = new Date().toISOString();
  memoryStore.set(entry.id, entry);

  const db = await getDb();
  if (!db) return;
  try {
    await db.run(
      `INSERT OR REPLACE INTO mcp_gateway_servers
       (id, name, endpoint, transport, status, last_health_check, auth_type,
        auth_config_json, tools_json, tool_count, rate_limit_json, tags_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ...Object.values(toDbRow(entry)),
      ],
    );
  } catch {
    // table may not exist yet
  }
}

export async function getServer(id: string): Promise<McpServerEntry | undefined> {
  await loadIntoMemory();
  return memoryStore.get(id);
}

export async function listServers(): Promise<McpServerEntry[]> {
  await loadIntoMemory();
  return Array.from(memoryStore.values());
}

export async function findServersByTag(tag: string): Promise<McpServerEntry[]> {
  await loadIntoMemory();
  return Array.from(memoryStore.values()).filter(
    (s) => s.tags?.includes(tag),
  );
}

export async function updateServer(
  id: string,
  updates: Partial<McpServerEntry>,
): Promise<McpServerEntry | null> {
  await loadIntoMemory();
  const existing = memoryStore.get(id);
  if (!existing) return null;

  const updated: McpServerEntry = {
    ...existing,
    ...updates,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  memoryStore.set(id, updated);

  const db = await getDb();
  if (!db) return updated;
  try {
    await db.run(
      `UPDATE mcp_gateway_servers SET
         name = ?, endpoint = ?, transport = ?, status = ?,
         last_health_check = ?, auth_type = ?, auth_config_json = ?,
         tools_json = ?, tool_count = ?, rate_limit_json = ?,
         tags_json = ?, updated_at = ?
       WHERE id = ?`,
      [
        updated.name,
        updated.endpoint,
        updated.transport,
        updated.status,
        updated.lastHealthCheck,
        updated.authType ?? null,
        JSON.stringify(updated.authConfig ?? {}),
        JSON.stringify(updated.tools),
        updated.toolCount,
        updated.rateLimit ? JSON.stringify(updated.rateLimit) : null,
        JSON.stringify(updated.tags ?? []),
        updated.updatedAt,
        updated.id,
      ],
    );
  } catch {
    // table may not exist yet
  }
  return updated;
}

export async function removeServer(id: string): Promise<boolean> {
  await loadIntoMemory();
  const deleted = memoryStore.delete(id);

  const db = await getDb();
  if (!db) return deleted;
  try {
    await db.run('DELETE FROM mcp_gateway_servers WHERE id = ?', [id]);
  } catch {
    // table may not exist yet
  }
  return deleted;
}

export async function getServerCount(): Promise<number> {
  await loadIntoMemory();
  return memoryStore.size;
}

export async function getHealthyServers(): Promise<McpServerEntry[]> {
  await loadIntoMemory();
  return Array.from(memoryStore.values()).filter((s) => s.status === 'healthy');
}

export async function getDegradedServers(): Promise<McpServerEntry[]> {
  await loadIntoMemory();
  return Array.from(memoryStore.values()).filter(
    (s) => s.status === 'degraded' || s.status === 'unhealthy',
  );
}

export async function getServersByTransport(
  transport: 'stdio' | 'http',
): Promise<McpServerEntry[]> {
  await loadIntoMemory();
  return Array.from(memoryStore.values()).filter((s) => s.transport === transport);
}
