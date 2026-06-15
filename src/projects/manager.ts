import { exists, ensureDir } from '@std/fs';
import { join } from '@std/path';
import { PATHS } from '../config/paths.ts';

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
}): Promise<ProjectConfig> {
  const dir = getProjectDir(name);
  await ensureDir(dir);

  const config: ProjectConfig = {
    name,
    path: dir,
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
  try {
    await Deno.remove(dir, { recursive: true });
    projects.delete(name);
    return true;
  } catch {
    return false;
  }
}

export function getActiveProject(): ProjectConfig | undefined {
  return [...projects.values()].find((p) => p.path === Deno.cwd());
}
