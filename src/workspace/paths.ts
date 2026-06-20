import { isAbsolute, join, normalize, resolve } from '@std/path';
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

const CONFIG_SOUL_FILES = new Set(['SOUL.md', 'USER.md', 'MEMORY.md']);

export function resolveWorkspacePath(
  agentId: string,
  rawPath: string,
  workspace: 'agent' | 'global' | 'config' = 'agent',
): string {
  if (workspace === 'config') {
    const configDir = normalize(resolve(PATHS.configDir));
    const candidate = isAbsolute(rawPath)
      ? normalize(rawPath)
      : normalize(join(configDir, rawPath));
    const filename = candidate.split('/').pop() ?? '';
    if (!candidate.startsWith(configDir + '/') || !CONFIG_SOUL_FILES.has(filename)) {
      throw new Error(
        `config workspace only allows writing to: ${[...CONFIG_SOUL_FILES].join(', ')}`,
      );
    }
    return candidate;
  }

  const agentDir = getAgentWorkspaceDir(agentId);
  const globalDir = getGlobalWorkspaceDir();
  const rootDir = workspace === 'agent' ? agentDir : globalDir;

  const candidate = isAbsolute(rawPath) ? normalize(rawPath) : normalize(join(rootDir, rawPath));

  const allowed = workspace === 'agent'
    ? [normalize(resolve(agentDir)), normalize(resolve(globalDir))]
    : [normalize(resolve(globalDir))];

  let withinAllowed = false;
  for (const base of allowed) {
    if (candidate === base) {
      withinAllowed = true;
      break;
    }
    if (candidate.length > base.length) {
      const sep = candidate[base.length];
      if ((sep === '/' || sep === '\\') && candidate.startsWith(base)) {
        withinAllowed = true;
        break;
      }
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
