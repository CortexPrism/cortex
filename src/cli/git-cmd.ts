import { Command } from '@cliffy/command';
import { ensureAgentWorkspace } from '../workspace/paths.ts';
import {
  gitStatus,
  gitLog,
  gitDiff,
  gitPush,
  gitPull,
  gitClone,
  gitListBranches,
  gitCheckout,
  gitCreateBranch,
  gitCommit,
  gitAdd,
  gitAddRemote,
  gitListRemotes,
  gitDiffStat,
} from '../workspace/git.ts';

async function resolveDir(agentId?: string): Promise<string> {
  if (agentId) return await ensureAgentWorkspace(agentId);
  return Deno.cwd();
}

export const gitCommand = new Command()
  .description('Git workspace operations');

const statusCmd = new Command()
  .description('Show working tree status')
  .option('--agent <agentId:string>', 'Agent workspace ID')
  .action(async (opts: { agent?: string }) => {
    const dir = await resolveDir(opts.agent);
    const st = await gitStatus(dir);
    console.log(`On branch ${st.branch}`);
    if (st.ahead || st.behind) console.log(`  ${st.ahead} ahead, ${st.behind} behind`);
    console.log(st.clean ? 'Working tree clean' : '');
    if (st.staged.length) console.log(`\nStaged:\n${st.staged.map((s) => `  ${s}`).join('\n')}`);
    if (st.unstaged.length) console.log(`\nUnstaged:\n${st.unstaged.map((s) => `  ${s}`).join('\n')}`);
    if (st.untracked.length) console.log(`\nUntracked:\n${st.untracked.map((s) => `  ${s}`).join('\n')}`);
  });

const logCmd = new Command()
  .description('Show commit log')
  .option('--agent <agentId:string>', 'Agent workspace ID')
  .option('--limit <limit:number>', 'Max commits', { default: 20 })
  .action(async (opts: { agent?: string; limit: number }) => {
    const dir = await resolveDir(opts.agent);
    const entries = await gitLog(dir, opts.limit);
    for (const e of entries) {
      console.log(`${e.hash.slice(0, 8)} ${e.date.slice(0, 10)} ${e.author}  ${e.message}`);
    }
  });

const diffCmd = new Command()
  .description('Show working tree diff')
  .option('--agent <agentId:string>', 'Agent workspace ID')
  .option('--stat', 'Show diffstat only')
  .option('--file <file:string>', 'Show diff for specific file')
  .action(async (opts: { agent?: string; stat?: boolean; file?: string }) => {
    const dir = await resolveDir(opts.agent);
    const output = opts.stat ? await gitDiffStat(dir) : await gitDiff(dir, opts.file);
    console.log(output);
  });

const addCmd = new Command()
  .description('Stage files')
  .arguments('<paths...:string>')
  .option('--agent <agentId:string>', 'Agent workspace ID')
  .option('--all', 'Stage all changes (git add -A)')
  .action(async (opts: { agent?: string; all?: boolean }, ...paths: string[]) => {
    const dir = await resolveDir(opts.agent);
    const files = opts.all ? ['-A'] : paths.flat();
    const ok = await gitAdd(dir, files);
    console.log(ok ? 'Staged.' : 'Failed to stage.');
  });

const commitCmd = new Command()
  .description('Create a commit')
  .arguments('<message:string>')
  .option('--agent <agentId:string>', 'Agent workspace ID')
  .option('--all', 'Stage all changes before commit')
  .action(async (opts: { agent?: string; all?: boolean }, message: string) => {
    const dir = await resolveDir(opts.agent);
    if (opts.all) await gitAdd(dir, ['-A']);
    const ok = await gitCommit(dir, message);
    console.log(ok ? `Committed: ${message}` : 'Nothing to commit.');
  });

const pushCmd = new Command()
  .description('Push to remote')
  .option('--agent <agentId:string>', 'Agent workspace ID')
  .option('--remote <remote:string>', 'Remote name', { default: 'origin' })
  .option('--branch <branch:string>', 'Branch to push')
  .action(async (opts: { agent?: string; remote: string; branch?: string }) => {
    const dir = await resolveDir(opts.agent);
    const result = await gitPush(dir, opts.remote, opts.branch);
    console.log(result.success ? 'Push successful.' : `Push failed:\n${result.output}`);
  });

const pullCmd = new Command()
  .description('Pull from remote')
  .option('--agent <agentId:string>', 'Agent workspace ID')
  .option('--remote <remote:string>', 'Remote name', { default: 'origin' })
  .option('--branch <branch:string>', 'Branch to pull')
  .action(async (opts: { agent?: string; remote: string; branch?: string }) => {
    const dir = await resolveDir(opts.agent);
    const result = await gitPull(dir, opts.remote, opts.branch);
    console.log(result.success ? 'Pull successful.' : `Pull failed:\n${result.output}`);
  });

const cloneCmd = new Command()
  .description('Clone a repository')
  .arguments('<url:string> <dest:string>')
  .option('--branch <branch:string>', 'Branch to clone')
  .action(async (opts: { branch?: string }, url: string, dest: string) => {
    const result = await gitClone(url, dest, opts.branch);
    console.log(result.success ? `Cloned into ${dest}` : `Clone failed:\n${result.output}`);
  });

const branchCmd = new Command()
  .description('List or create/switch branches')
  .option('--agent <agentId:string>', 'Agent workspace ID')
  .option('--create <name:string>', 'Create a new branch')
  .option('--checkout <name:string>', 'Switch to branch')
  .action(async (opts: { agent?: string; create?: string; checkout?: string }) => {
    const dir = await resolveDir(opts.agent);
    if (opts.create) {
      const ok = await gitCreateBranch(dir, opts.create);
      return console.log(ok ? `Created and switched to ${opts.create}` : 'Failed.');
    }
    if (opts.checkout) {
      const ok = await gitCheckout(dir, opts.checkout);
      return console.log(ok ? `Switched to ${opts.checkout}` : 'Failed.');
    }
    const branches = await gitListBranches(dir);
    for (const b of branches) {
      console.log(`${b.current ? '*' : ' '} ${b.name}`);
    }
  });

const remoteCmd = new Command()
  .description('Manage remotes')
  .option('--agent <agentId:string>', 'Agent workspace ID')
  .option('--add <name:string>', 'Add remote')
  .option('--url <url:string>', 'Remote URL (for --add)')
  .action(async (opts: { agent?: string; add?: string; url?: string }) => {
    const dir = await resolveDir(opts.agent);
    if (opts.add && opts.url) {
      const ok = await gitAddRemote(dir, opts.add, opts.url);
      return console.log(ok ? `Added remote ${opts.add}` : 'Failed.');
    }
    const remotes = await gitListRemotes(dir);
    for (const r of remotes) console.log(`${r.name}\t${r.url}`);
  });

gitCommand
  .command('status', statusCmd)
  .command('log', logCmd)
  .command('diff', diffCmd)
  .command('add', addCmd)
  .command('commit', commitCmd)
  .command('push', pushCmd)
  .command('pull', pullCmd)
  .command('clone', cloneCmd)
  .command('branch', branchCmd)
  .command('remote', remoteCmd);
