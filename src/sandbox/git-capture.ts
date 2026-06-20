import { debugLog, gitLog, warnLog } from './logger.ts';
import type { GitSnapshot } from './snapshot-types.ts';

export async function captureGitState(workspacePath: string): Promise<GitSnapshot> {
  debugLog(gitLog, `capturing git state: ${workspacePath}`);
  const result: GitSnapshot = {
    branch: '',
    headCommit: '',
    dirty: false,
    changedFiles: [],
    untrackedFiles: [],
  };
  try {
    const branchOut = new TextDecoder().decode(
      (await new Deno.Command('git', {
        args: ['rev-parse', '--abbrev-ref', 'HEAD'],
        cwd: workspacePath,
      }).output()).stdout,
    ).trim();
    result.branch = branchOut;
  } catch { /* not a git repo */ }
  try {
    const headOut = new TextDecoder().decode(
      (await new Deno.Command('git', { args: ['rev-parse', 'HEAD'], cwd: workspacePath }).output())
        .stdout,
    ).trim();
    result.headCommit = headOut;
  } catch { /* not a git repo */ }
  try {
    const statusOut = new TextDecoder().decode(
      (await new Deno.Command('git', { args: ['status', '--porcelain'], cwd: workspacePath })
        .output()).stdout,
    );
    const lines = statusOut.trim().split('\n').filter(Boolean);
    for (const line of lines) {
      if (line.startsWith('??')) {
        result.untrackedFiles.push(line.slice(3));
      } else {
        result.changedFiles.push(line.slice(3));
      }
    }
    result.dirty = lines.length > 0;
  } catch { /* not a git repo */ }
  return result;
}
