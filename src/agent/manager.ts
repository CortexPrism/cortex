import { exists } from '@std/fs';
import { loadConfig, saveConfig } from '../config/config.ts';
import type { AgentConfig } from '../config/config.ts';
import { PATHS } from '../config/paths.ts';
import { DEFAULT_SOUL } from './soul.ts';
import { ensureDefaultAgent, isBuiltinAgentId } from './builtin-agents.ts';
import * as dbAgents from '../db/agents.ts';

function makeAgentId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || `agent_${Date.now().toString(36)}`;
}

function now(): string {
  return new Date().toISOString();
}

export { ensureDefaultAgent } from './builtin-agents.ts';

// ── DB-based Agent CRUD ──────────────────────────────────────

export async function registerAgent(
  cfg: Omit<AgentConfig, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  userId?: string,
  teamId?: string,
): Promise<AgentConfig> {
  const id = cfg.id || makeAgentId(cfg.name);
  const existing = await dbAgents.getAgent(id);
  if (existing) {
    throw new Error(`Agent "${id}" already exists`);
  }
  const agent: AgentConfig = {
    ...cfg,
    id,
    createdAt: now(),
    updatedAt: now(),
  };
  const row = agent as AgentConfig & { user_id?: string; team_id?: string };
  row.user_id = userId ?? undefined;
  row.team_id = teamId ?? undefined;
  await dbAgents.insertAgent(row);

  // Also store in config for backward compat
  try {
    const config = await loadConfig();
    config.agents[id] = agent;
    await saveConfig(config);
  } catch { /* config save is best-effort for compat */ }

  return agent;
}

export async function getAgent(id: string): Promise<AgentConfig | null> {
  const agent = await dbAgents.getAgent(id);
  if (agent) return agent;

  // Fall back to config for backward compat
  const config = await loadConfig();
  return config.agents?.[id] ?? null;
}

export async function getDefaultAgent(userId?: string, teamId?: string): Promise<AgentConfig> {
  const defaultId = await dbAgents.getDefaultAgentId(userId);
  let agent = await dbAgents.getAgent(defaultId ?? 'assistant');
  if (agent) return agent;

  // Fall back to config
  const config = await loadConfig();
  const withDefaults = ensureDefaultAgent(config);
  const fallbackId = config.defaultAgent && config.defaultAgent !== 'default'
    ? config.defaultAgent
    : 'assistant';
  return withDefaults.agents[fallbackId] ?? withDefaults.agents['assistant']!;
}

export async function listAgents(
  userId?: string,
  teamIds?: string[],
): Promise<AgentConfig[]> {
  const agents = await dbAgents.listAgents(userId, teamIds);

  // Merge with config agents for backward compat
  const config = await loadConfig();
  ensureDefaultAgent(config);
  for (const [id, agent] of Object.entries(config.agents)) {
    if (!agents.find((a) => a.id === id)) {
      agents.push(agent);
    }
  }

  return agents.sort((a, b) => a.name.localeCompare(b.name));
}

export async function updateAgent(
  id: string,
  patch: Partial<Omit<AgentConfig, 'id' | 'createdAt'>>,
): Promise<AgentConfig> {
  let agent = await dbAgents.getAgent(id);

  // Fall back to config
  if (!agent) {
    const config = await loadConfig();
    const existing = config.agents[id];
    if (!existing) throw new Error(`Agent "${id}" not found`);
    agent = existing;
  }

  const result = await dbAgents.updateAgent(id, patch);
  if (result) return result;

  // Update in config as fallback
  const config = await loadConfig();
  const existing = config.agents[id];
  if (!existing) throw new Error(`Agent "${id}" not found`);
  config.agents[id] = {
    ...existing,
    ...patch,
    id,
    updatedAt: now(),
  };
  await saveConfig(config);
  return config.agents[id];
}

export async function cloneAgent(
  sourceId: string,
  newName: string,
): Promise<AgentConfig> {
  const source = await getAgent(sourceId);
  if (!source) throw new Error(`Source agent "${sourceId}" not found`);

  const id = makeAgentId(newName);
  const existing = await dbAgents.getAgent(id);
  if (existing) {
    throw new Error(`Agent "${id}" already exists`);
  }

  const cloned: AgentConfig = {
    ...source,
    id,
    name: newName,
    description: source.description
      ? `Clone of "${source.name}": ${source.description}`
      : `Clone of "${source.name}"`,
    createdAt: now(),
    updatedAt: now(),
  };

  await dbAgents.insertAgent(cloned);
  return cloned;
}

export async function deleteAgent(id: string): Promise<void> {
  if (isBuiltinAgentId(id)) throw new Error(`Cannot delete built-in agent "${id}"`);

  const deleted = await dbAgents.deleteAgent(id);

  // Also delete from config for backward compat
  const config = await loadConfig();
  const existedInConfig = !!config.agents[id];
  if (existedInConfig) {
    delete config.agents[id];
    if (config.defaultAgent === id) {
      config.defaultAgent = 'assistant';
    }
    await saveConfig(config);
  }

  if (!deleted && !existedInConfig) {
    throw new Error(`Agent "${id}" not found`);
  }
}

export async function selectAgent(id: string, userId?: string): Promise<void> {
  // Verify agent exists
  const agent = await getAgent(id);
  if (!agent) throw new Error(`Agent "${id}" not found`);

  await dbAgents.setDefaultAgent(userId, id);

  // Only update global config default when this is a global selection (no userId)
  if (!userId) {
    const config = await loadConfig();
    config.defaultAgent = id;
    await saveConfig(config);
  }
}

export async function loadAgentIdentity(
  agent: AgentConfig,
): Promise<{ soul: string; user: string; memory: string }> {
  const result = { soul: '', user: '', memory: '' };

  if (agent.soul) {
    result.soul = agent.soul;
  } else if (agent.soulFile && await exists(agent.soulFile)) {
    result.soul = await Deno.readTextFile(agent.soulFile);
  } else {
    result.soul = await readOrDefault(agent.soulFile || PATHS.soulFile, DEFAULT_SOUL);
  }

  const userPath = agent.userFile || PATHS.userFile;
  if (await exists(userPath)) {
    result.user = await Deno.readTextFile(userPath);
  }

  const memoryPath = agent.memoryFile || PATHS.memoryFile;
  if (await exists(memoryPath)) {
    result.memory = await Deno.readTextFile(memoryPath);
  }

  return result;
}

export function resolveAgentTools(agent: AgentConfig): string[] | null {
  if (!agent.tools || agent.tools.length === 0) return null;
  return agent.tools;
}

async function readOrDefault(filePath: string, defaultContent: string): Promise<string> {
  try {
    if (await exists(filePath)) {
      return await Deno.readTextFile(filePath);
    }
  } catch { /* ignore */ }
  return defaultContent;
}
