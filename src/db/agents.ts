import { getCoreDb } from '../db/client.ts';
import type { AgentConfig } from '../config/config.ts';
import type { InValue } from 'npm:@libsql/client';

const now = () => new Date().toISOString();

export async function listAgents(
  userId?: string,
  teamIds?: string[],
): Promise<AgentConfig[]> {
  const db = await getCoreDb();
  const args: InValue[] = [];
  let sql: string;

  if (userId) {
    sql = `SELECT * FROM agents WHERE user_id = ?`;
    args.push(userId);
    if (teamIds && teamIds.length > 0) {
      sql += ` OR team_id IN (${teamIds.map(() => '?').join(',')})`;
      args.push(...teamIds);
    }
    sql += ` OR (user_id IS NULL AND team_id IS NULL)`;
  } else if (teamIds && teamIds.length > 0) {
    sql = `SELECT * FROM agents WHERE team_id IN (${teamIds.map(() => '?').join(',')})`;
    args.push(...teamIds);
    sql += ` OR (user_id IS NULL AND team_id IS NULL)`;
  } else {
    sql = `SELECT * FROM agents WHERE user_id IS NULL AND team_id IS NULL`;
  }

  const rows = await db.all<Record<string, unknown>>(sql, args);
  return rows.map(rowToAgent);
}

export async function getAgent(id: string): Promise<AgentConfig | null> {
  const db = await getCoreDb();
  const row = await db.get<Record<string, unknown>>(
    `SELECT * FROM agents WHERE id = ?`,
    [id],
  );
  if (!row) return null;
  return rowToAgent(row);
}

export async function insertAgent(agent: AgentConfig): Promise<void> {
  const db = await getCoreDb();
  await db.run(
    `INSERT INTO agents (id, name, description, icon, category, version, soul, soul_file, user_file, memory_file,
      system_prompt, provider, model, max_turns, temperature, tools, router, tags, builtin,
      resource_limits, personality, user_id, team_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      agent.id,
      agent.name,
      agent.description ?? null,
      agent.icon ?? null,
      agent.category ?? null,
      agent.version ?? null,
      agent.soul ?? null,
      agent.soulFile ?? null,
      agent.userFile ?? null,
      agent.memoryFile ?? null,
      agent.systemPrompt ?? null,
      agent.provider ?? null,
      agent.model ?? null,
      agent.maxTurns ?? null,
      agent.temperature ?? null,
      JSON.stringify(agent.tools ?? []),
      agent.router ? JSON.stringify(agent.router) : null,
      JSON.stringify(agent.tags ?? []),
      agent.builtin ? 1 : 0,
      agent.resourceLimits ? JSON.stringify(agent.resourceLimits) : null,
      agent.personality ? JSON.stringify(agent.personality) : null,
      (agent as AgentConfig & { user_id?: string }).user_id ?? null,
      (agent as AgentConfig & { team_id?: string }).team_id ?? null,
      agent.createdAt ?? now(),
      agent.updatedAt ?? now(),
    ] as InValue[],
  );
}

export async function updateAgent(
  id: string,
  patch: Partial<AgentConfig> & { user_id?: string; team_id?: string },
): Promise<AgentConfig | null> {
  const db = await getCoreDb();
  const existing = await db.get<Record<string, unknown>>(
    `SELECT * FROM agents WHERE id = ?`,
    [id],
  );
  if (!existing) return null;

  const merged = {
    ...rowToAgent(existing),
    ...patch,
    id,
    updatedAt: now(),
  };
  // Preserve scope fields
  const userId = (patch as Record<string, unknown>).user_id as string | undefined ??
    existing.user_id as string | undefined;
  const teamId = (patch as Record<string, unknown>).team_id as string | undefined ??
    existing.team_id as string | undefined;

  await db.run(
    `UPDATE agents SET name=?, description=?, icon=?, category=?, version=?, soul=?, soul_file=?,
      user_file=?, memory_file=?, system_prompt=?, provider=?, model=?, max_turns=?, temperature=?,
      tools=?, router=?, tags=?, builtin=?, resource_limits=?, personality=?, user_id=?, team_id=?, updated_at=?
     WHERE id=?`,
    [
      merged.name,
      merged.description ?? null,
      merged.icon ?? null,
      merged.category ?? null,
      merged.version ?? null,
      merged.soul ?? null,
      merged.soulFile ?? null,
      merged.userFile ?? null,
      merged.memoryFile ?? null,
      merged.systemPrompt ?? null,
      merged.provider ?? null,
      merged.model ?? null,
      merged.maxTurns ?? null,
      merged.temperature ?? null,
      JSON.stringify(merged.tools ?? []),
      merged.router ? JSON.stringify(merged.router) : null,
      JSON.stringify(merged.tags ?? []),
      merged.builtin ? 1 : 0,
      merged.resourceLimits ? JSON.stringify(merged.resourceLimits) : null,
      merged.personality ? JSON.stringify(merged.personality) : null,
      userId ?? null,
      teamId ?? null,
      merged.updatedAt,
      id,
    ] as InValue[],
  );
  return merged;
}

export async function deleteAgent(id: string): Promise<boolean> {
  const db = await getCoreDb();
  const existing = await db.get<{ id: string }>(
    `SELECT id FROM agents WHERE id = ?`,
    [id],
  );
  if (!existing) return false;
  await db.run(`DELETE FROM agents WHERE id = ?`, [id]);
  return true;
}

export async function setDefaultAgent(userId: string | undefined, agentId: string): Promise<void> {
  const db = await getCoreDb();
  if (userId) {
    await db.run(
      `INSERT INTO config (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [`default_agent_${userId}`, agentId, now()],
    );
  } else {
    await db.run(
      `INSERT INTO config (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ['default_agent', agentId, now()],
    );
  }
}

export async function getDefaultAgentId(userId?: string): Promise<string | null> {
  const db = await getCoreDb();
  const key = userId ? `default_agent_${userId}` : 'default_agent';
  const row = await db.get<{ value: string }>(
    `SELECT value FROM config WHERE key = ?`,
    [key],
  );
  if (row) return row.value;
  if (userId) {
    const global = await db.get<{ value: string }>(
      `SELECT value FROM config WHERE key = ?`,
      ['default_agent'],
    );
    return global?.value ?? 'assistant';
  }
  return 'assistant';
}

export async function getAgentsForConfigFallback(): Promise<Record<string, AgentConfig>> {
  const db = await getCoreDb();
  const rows = await db.all<Record<string, unknown>>(
    `SELECT * FROM agents`,
  );
  const agents: Record<string, AgentConfig> = {};
  for (const row of rows) {
    agents[row.id as string] = rowToAgent(row);
  }
  return agents;
}

function rowToAgent(row: Record<string, unknown>): AgentConfig & { user_id?: string; team_id?: string } {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description ?? undefined) as string | undefined,
    icon: (row.icon ?? undefined) as string | undefined,
    category: (row.category ?? undefined) as string | undefined,
    version: (row.version ?? undefined) as string | undefined,
    soul: (row.soul ?? undefined) as string | undefined,
    soulFile: (row.soul_file ?? undefined) as string | undefined,
    userFile: (row.user_file ?? undefined) as string | undefined,
    memoryFile: (row.memory_file ?? undefined) as string | undefined,
    systemPrompt: (row.system_prompt ?? undefined) as string | undefined,
    provider: (row.provider ?? undefined) as string | undefined,
    model: (row.model ?? undefined) as string | undefined,
    maxTurns: (row.max_turns ?? undefined) as number | undefined,
    temperature: (row.temperature ?? undefined) as number | undefined,
    tools: parseJson((row.tools as string) ?? '[]', []),
    router: parseJson((row.router as string) ?? undefined, undefined),
    tags: parseJson((row.tags as string) ?? '[]', []),
    builtin: row.builtin === 1 || row.builtin === '1',
    resourceLimits: parseJson((row.resource_limits as string) ?? undefined, undefined),
    personality: parseJson((row.personality as string) ?? undefined, undefined),
    createdAt: (row.created_at as string) ?? now(),
    updatedAt: (row.updated_at as string) ?? now(),
    user_id: (row.user_id ?? undefined) as string | undefined,
    team_id: (row.team_id ?? undefined) as string | undefined,
  } as AgentConfig & { user_id?: string; team_id?: string };
}

function parseJson<T>(str: string | undefined, fallback: T): T {
  if (!str) return fallback;
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}
