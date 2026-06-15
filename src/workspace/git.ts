export interface GitStatusResult {
  branch: string;
  clean: boolean;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  ahead: number;
  behind: number;
}

export interface GitLogEntry {
  hash: string;
  author: string;
  date: string;
  message: string;
}

export interface GitBranchInfo {
  current: boolean;
  name: string;
  remote: string | null;
}

async function git(args: string[], dir?: string): Promise<{ success: boolean; stdout: string; stderr: string }> {
  try {
    const cmdArgs = dir ? ['-C', dir, ...args] : args;
    const cmd = new Deno.Command('git', {
      args: cmdArgs,
      stdout: 'piped',
      stderr: 'piped',
    });
    const result = await cmd.output();
    return {
      success: result.success,
      stdout: new TextDecoder().decode(result.stdout).trim(),
      stderr: new TextDecoder().decode(result.stderr).trim(),
    };
  } catch (e) {
    return { success: false, stdout: '', stderr: (e as Error).message };
  }
}

export async function gitInit(dir: string): Promise<void> {
  await git(['init'], dir);
}

export async function gitAutoCommit(
  dir: string,
  agentId: string,
  filePath: string,
  toolName: string,
): Promise<void> {
  const add = await git(['add', filePath], dir);
  if (!add.success) return;

  await git(
    ['commit', '--no-gpg-sign', '-m', `agent/${agentId}: ${toolName} ${filePath}`, '--allow-empty'],
    dir,
  );
}

export async function gitEnsureBranch(
  dir: string,
  branch: string,
): Promise<void> {
  const check = await git(['rev-parse', '--abbrev-ref', 'HEAD'], dir);
  if (check.stdout === branch) return;

  await git(['checkout', '-b', branch], dir);
}

export async function gitStatus(dir: string): Promise<GitStatusResult> {
  const branchResult = await git(['rev-parse', '--abbrev-ref', 'HEAD'], dir);
  const branch = branchResult.success ? branchResult.stdout : 'HEAD';

  const porcelain = await git(['status', '--porcelain'], dir);
  const staged: string[] = [];
  const unstaged: string[] = [];
  const untracked: string[] = [];
  for (const line of porcelain.stdout.split('\n')) {
    if (!line.trim()) continue;
    const status = line.slice(0, 2);
    const file = line.slice(3);
    if (status === '??') untracked.push(file);
    else if (status[0] !== ' ') staged.push(`${status} ${file}`);
    if (status[1] !== ' ' && status !== '??') unstaged.push(`${status[1]} ${file}`);
  }

  const aheadBehind = await git(['rev-list', '--count', '--left-right', '@{upstream}...HEAD'], dir);
  let ahead = 0;
  let behind = 0;
  if (aheadBehind.success && aheadBehind.stdout) {
    const parts = aheadBehind.stdout.split('\t');
    behind = Number(parts[0]) || 0;
    ahead = Number(parts[1]) || 0;
  }

  return {
    branch,
    clean: porcelain.stdout.trim() === '',
    staged: [...new Set(staged)],
    unstaged: [...new Set(unstaged)],
    untracked,
    ahead,
    behind,
  };
}

export async function gitLog(dir: string, maxCount = 20): Promise<GitLogEntry[]> {
  const result = await git(
    ['log', `--max-count=${maxCount}`, '--format=%H|%an|%ai|%s'],
    dir,
  );
  if (!result.success) return [];
  return result.stdout.split('\n').filter(Boolean).map((line) => {
    const [hash, author, date, ...msgParts] = line.split('|');
    return { hash, author, date, message: msgParts.join('|') };
  });
}

export async function gitDiff(dir: string, file?: string): Promise<string> {
  const args = file ? ['diff', '--', file] : ['diff'];
  const result = await git(args, dir);
  return result.stdout || '(clean)';
}

export async function gitDiffStat(dir: string): Promise<string> {
  const result = await git(['diff', '--stat'], dir);
  return result.stdout || '(clean)';
}

export async function gitAdd(dir: string, paths: string[]): Promise<boolean> {
  const result = await git(['add', ...paths], dir);
  return result.success;
}

export async function gitCommit(dir: string, message: string): Promise<boolean> {
  const result = await git(['commit', '--no-gpg-sign', '-m', message, '--allow-empty'], dir);
  return result.success;
}

export async function gitPush(
  dir: string,
  remote = 'origin',
  branch?: string,
): Promise<{ success: boolean; output: string }> {
  const args = branch ? ['push', remote, branch] : ['push', remote];
  const result = await git(args, dir);
  return { success: result.success, output: result.stdout || result.stderr };
}

export async function gitPull(
  dir: string,
  remote = 'origin',
  branch?: string,
): Promise<{ success: boolean; output: string }> {
  const args = branch ? ['pull', remote, branch] : ['pull', remote];
  const result = await git(args, dir);
  return { success: result.success, output: result.stdout || result.stderr };
}

export async function gitClone(
  url: string,
  dest: string,
  branch?: string,
): Promise<{ success: boolean; output: string }> {
  const args = branch ? ['clone', '--branch', branch, url, dest] : ['clone', url, dest];
  const result = await git(args);
  return { success: result.success, output: result.stdout || result.stderr };
}

export async function gitListBranches(dir: string): Promise<GitBranchInfo[]> {
  const result = await git(['branch', '-a'], dir);
  if (!result.success) return [];
  return result.stdout.split('\n').filter(Boolean).map((line) => {
    const current = line.startsWith('*');
    const name = line.replace(/^\*?\s*/, '').trim();
    const remote = name.includes('/') ? name.split('/')[0] : null;
    return { current, name, remote };
  });
}

export async function gitCheckout(dir: string, branch: string): Promise<boolean> {
  const result = await git(['checkout', branch], dir);
  return result.success;
}

export async function gitCreateBranch(dir: string, branch: string): Promise<boolean> {
  const result = await git(['checkout', '-b', branch], dir);
  return result.success;
}

export async function gitAddRemote(dir: string, name: string, url: string): Promise<boolean> {
  const result = await git(['remote', 'add', name, url], dir);
  return result.success;
}

export async function gitRemoveRemote(dir: string, name: string): Promise<boolean> {
  const result = await git(['remote', 'remove', name], dir);
  return result.success;
}

export async function gitListRemotes(dir: string): Promise<Array<{ name: string; url: string }>> {
  const result = await git(['remote', '-v'], dir);
  if (!result.success) return [];
  const remotes = new Map<string, string>();
  for (const line of result.stdout.split('\n')) {
    const parts = line.split('\t');
    if (parts.length >= 2) {
      const name = parts[0];
      const url = parts[1].split(/\s+/)[0];
      remotes.set(name, url);
    }
  }
  return Array.from(remotes.entries()).map(([name, url]) => ({ name, url }));
}

export async function gitSetConfig(dir: string, key: string, value: string): Promise<boolean> {
  const result = await git(['config', key, value], dir);
  return result.success;
}
