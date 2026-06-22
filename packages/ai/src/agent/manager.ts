import { exists } from '@std/fs';
import { loadConfig, saveConfig } from '../../../../src/config/config.ts';
import type { AgentConfig } from '../../../../src/config/config.ts';
import { PATHS } from '../../../../src/config/paths.ts';
import { DEFAULT_SOUL } from './soul.ts';
import { ensureDefaultAgent, isBuiltinAgentId } from './builtin-agents.ts';

/** Generate a short unique agent ID */
function makeAgentId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || `agent_${Date.now().toString(36)}`;
}

function now(): string {
  return new Date().toISOString();
}

/** Ensure default and built-in agents exist in config. Re-exported from builtin-agents. */
export { ensureDefaultAgent } from './builtin-agents.ts';

/** Register a new agent */
export async function registerAgent(
  cfg: Omit<AgentConfig, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
): Promise<AgentConfig> {
  const config = await loadConfig();
  const id = cfg.id || makeAgentId(cfg.name);
  if (config.agents[id]) {
    throw new Error(`Agent "${id}" already exists`);
  }
  const agent: AgentConfig = {
    ...cfg,
    id,
    createdAt: now(),
    updatedAt: now(),
  };
  config.agents[id] = agent;
  await saveConfig(config);
  return agent;
}

/** Get an agent by ID */
export async function getAgent(id: string): Promise<AgentConfig | null> {
  const config = await loadConfig();
  return config.agents?.[id] ?? null;
}

/** Get the currently selected/default agent */
export async function getDefaultAgent(): Promise<AgentConfig> {
  const config = await loadConfig();
  const id = (config.defaultAgent && config.defaultAgent !== 'default')
    ? config.defaultAgent
    : 'assistant';
  // Ensure built-in agents exist
  const withDefaults = ensureDefaultAgent(config);
  return withDefaults.agents[id] ?? withDefaults.agents['assistant']!;
}

/** List all registered agents */
export async function listAgents(): Promise<AgentConfig[]> {
  const config = await loadConfig();
  ensureDefaultAgent(config);
  return Object.values(config.agents)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Update an existing agent */
export async function updateAgent(
  id: string,
  patch: Partial<Omit<AgentConfig, 'id' | 'createdAt'>>,
): Promise<AgentConfig> {
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

/** Clone an existing agent with a new name */
export async function cloneAgent(
  sourceId: string,
  newName: string,
): Promise<AgentConfig> {
  const config = await loadConfig();
  const source = config.agents[sourceId];
  if (!source) throw new Error(`Source agent "${sourceId}" not found`);

  const id = makeAgentId(newName);
  if (config.agents[id]) {
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

  config.agents[id] = cloned;
  await saveConfig(config);
  return cloned;
}

/** Delete an agent */
export async function deleteAgent(id: string): Promise<void> {
  const config = await loadConfig();
  if (!config.agents[id]) throw new Error(`Agent "${id}" not found`);
  if (isBuiltinAgentId(id)) throw new Error(`Cannot delete built-in agent "${id}"`);

  delete config.agents[id];

  // Reset defaultAgent if it was the deleted one
  if (config.defaultAgent === id) {
    config.defaultAgent = 'assistant';
  }
  await saveConfig(config);
}

/** Set the default/active agent */
export async function selectAgent(id: string): Promise<void> {
  const config = await loadConfig();
  if (!config.agents[id]) throw new Error(`Agent "${id}" not found`);
  config.defaultAgent = id;
  await saveConfig(config);
}

/**
 * Load the identity context for a given agent.
 * Returns soul/user/memory content strings.
 */
export async function loadAgentIdentity(
  agent: AgentConfig,
): Promise<{ soul: string; user: string; memory: string }> {
  const result = { soul: '', user: '', memory: '' };

  // Soul: inline takes precedence
  if (agent.soul) {
    result.soul = agent.soul;
  } else if (agent.soulFile && await exists(agent.soulFile)) {
    result.soul = await Deno.readTextFile(agent.soulFile);
  } else {
    result.soul = await readOrDefault(agent.soulFile || PATHS.soulFile, DEFAULT_SOUL);
  }

  // User file — agent-specific first, then global fallback
  const userPath = agent.userFile || PATHS.userFile;
  if (await exists(userPath)) {
    result.user = await Deno.readTextFile(userPath);
  }

  // Memory file — agent-specific first, then global fallback
  const memoryPath = agent.memoryFile || PATHS.memoryFile;
  if (await exists(memoryPath)) {
    result.memory = await Deno.readTextFile(memoryPath);
  }

  return result;
}

/** Resolve a tool allow-list: null means all tools, string[] means those only */
export function resolveAgentTools(agent: AgentConfig): string[] | null {
  if (!agent.tools || agent.tools.length === 0) return null; // all tools
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
