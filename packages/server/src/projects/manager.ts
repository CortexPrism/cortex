import { ensureDir, type exists } from '@std/fs';
import { join } from '@std/path';
import { PATHS } from '../../../../src/config/paths.ts';

export interface ProjectConfig {
  name: string;
  path: string;
  agentId?: string;
  memoryDb?: string;
  created: string;
  tools: string[];
  description?: string;
}

const projects = new Map<string, ProjectConfig>();

export function getProjectDir(name: string): string {
  return join(PATHS.dataDir, 'projects', name);
}

export async function createProject(name: string, opts?: {
  agentId?: string;
  description?: string;
  tools?: string[];
  path?: string;
}): Promise<ProjectConfig> {
  const dir = getProjectDir(name);
  await ensureDir(dir);

  const config: ProjectConfig = {
    name,
    path: opts?.path ?? dir,
    agentId: opts?.agentId,
    description: opts?.description,
    tools: opts?.tools ?? [],
    created: new Date().toISOString(),
  };

  const configPath = join(dir, 'cortex-project.json');
  await Deno.writeTextFile(configPath, JSON.stringify(config, null, 2));

  projects.set(name, config);
  return config;
}

export async function loadProject(name: string): Promise<ProjectConfig | null> {
  const dir = getProjectDir(name);
  try {
    const configPath = join(dir, 'cortex-project.json');
    const data = await Deno.readTextFile(configPath);
    const config = JSON.parse(data) as ProjectConfig;
    projects.set(name, config);
    return config;
  } catch {
    return null;
  }
}

export async function listProjects(): Promise<ProjectConfig[]> {
  const dir = join(PATHS.dataDir, 'projects');
  try {
    await ensureDir(dir);
    const entries = [];
    for await (const entry of Deno.readDir(dir)) {
      if (entry.isDirectory) {
        const project = await loadProject(entry.name);
        if (project) entries.push(project);
      }
    }
    return entries;
  } catch {
    return [];
  }
}

export async function deleteProject(name: string): Promise<boolean> {
  const dir = getProjectDir(name);
  const existing = await loadProject(name);
  if (!existing) return false;
  try {
    await Deno.remove(dir, { recursive: true });
    projects.delete(name);
  } catch {
    return false;
  }
  const agentId = existing.agentId ?? 'assistant';
  // Fire-and-forget codegraph cleanup
  import('../../../../src/codegraph/graph.ts').then(({ deleteCodeProject }) => {
    deleteCodeProject(name).catch(() => {});
  }).catch(() => {});
  // Fire-and-forget agent workspace cleanup if no other project uses the same agent
  cleanupAgentWorkspaceIfOrphaned(agentId).catch(() => {});
  return true;
}

async function cleanupAgentWorkspaceIfOrphaned(agentId: string): Promise<void> {
  const projectsDir = join(PATHS.dataDir, 'projects');
  try {
    for await (const entry of Deno.readDir(projectsDir)) {
      if (!entry.isDirectory) continue;
      try {
        const configPath = join(projectsDir, entry.name, 'cortex-project.json');
        const data = await Deno.readTextFile(configPath);
        const config = JSON.parse(data) as ProjectConfig;
        if ((config.agentId ?? 'assistant') === agentId) return;
      } catch { /* skip unreadable project */ }
    }
    // No other project uses this agent — safe to remove workspace
    const wsDir = join(PATHS.workspacesDir, agentId);
    await Deno.remove(wsDir, { recursive: true });
  } catch { /* best-effort cleanup */ }
}

export function getActiveProject(): ProjectConfig | undefined {
  return [...projects.values()].find((p) => p.path === Deno.cwd());
}
