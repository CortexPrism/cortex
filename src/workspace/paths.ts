import { join, resolve, normalize } from '@std/path';
import { ensureDir } from '@std/fs';
import { PATHS } from '../config/paths.ts';

function getDataDir(): string {
  return PATHS.workspacesDir;
}

export function getAgentWorkspaceDir(agentId: string): string {
  return join(getDataDir(), agentId);
}

export function getGlobalWorkspaceDir(): string {
  return Deno.cwd();
}

export function resolveWorkspacePath(
  agentId: string,
  rawPath: string,
  workspace: 'agent' | 'global' = 'agent',
): string {
  const agentDir = getAgentWorkspaceDir(agentId);
  const globalDir = getGlobalWorkspaceDir();
  const rootDir = workspace === 'agent' ? agentDir : globalDir;

  const candidate = rawPath.startsWith('/')
    ? normalize(resolve(rawPath))
    : normalize(resolve(join(rootDir, rawPath)));

  const allowed = workspace === 'agent'
    ? [normalize(resolve(agentDir)), normalize(resolve(globalDir))]
    : [normalize(resolve(globalDir))];

  let withinAllowed = false;
  for (const base of allowed) {
    if (candidate === base || candidate.startsWith(base + '/')) {
      withinAllowed = true;
      break;
    }
  }

  if (!withinAllowed) {
    throw new Error(
      `Path "${rawPath}" resolves to "${candidate}" which is outside the allowed workspace roots`,
    );
  }

  return candidate;
}

export async function ensureAgentWorkspace(agentId: string): Promise<string> {
  const dir = getAgentWorkspaceDir(agentId);
  await ensureDir(dir);

  try {
    const gitDir = join(dir, '.git');
    await Deno.stat(gitDir);
  } catch {
    const cmd = new Deno.Command('git', {
      args: ['-C', dir, 'init'],
      stdout: 'null',
      stderr: 'null',
    });
    await cmd.output();
  }

  return dir;
}
