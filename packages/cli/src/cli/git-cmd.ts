import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { ensureAgentWorkspace, getGlobalWorkspaceDir } from '../../../../src/workspace/paths.ts';
import {
  gitAdd,
  gitAddRemote,
  gitCheckout,
  gitClone,
  gitCommit,
  gitCreateBranch,
  gitDiff,
  gitDiffStat,
  gitListBranches,
  gitListRemotes,
  gitLog,
  gitPull,
  gitPush,
  gitStatus,
} from '../../../../src/workspace/git.ts';
import { i18n } from '../../../../src/i18n/service.ts';

async function resolveDir(agentId?: string): Promise<string> {
  if (agentId) return await ensureAgentWorkspace(agentId);
  return getGlobalWorkspaceDir();
}

const statusCmd = cortexCommand('status')
  .description('Show working tree status')
  .option('--agent <agentId:string>', 'Agent workspace ID')
  .action(async (opts: Record<string, unknown>, _ctx: Ctx) => {
    const dir = await resolveDir(opts.agent as string | undefined);
    const st = await gitStatus(dir);
    console.log(`On branch ${st.branch}`);
    if (st.ahead || st.behind) console.log(`  ${st.ahead} ahead, ${st.behind} behind`);
    console.log(st.clean ? 'Working tree clean' : '');
    if (st.staged.length) console.log(`\nStaged:\n${st.staged.map((s) => `  ${s}`).join('\n')}`);
    if (st.unstaged.length) {
      console.log(`\nUnstaged:\n${st.unstaged.map((s) => `  ${s}`).join('\n')}`);
    }
    if (st.untracked.length) {
      console.log(`\nUntracked:\n${st.untracked.map((s) => `  ${s}`).join('\n')}`);
    }
  });

const logCmd = cortexCommand('log')
  .description('Show commit log')
  .option('--agent <agentId:string>', 'Agent workspace ID')
  .option('--limit <limit:number>', 'Max commits', { default: 20 })
  .action(async (opts: Record<string, unknown>, _ctx: Ctx) => {
    const dir = await resolveDir(opts.agent as string | undefined);
    const entries = await gitLog(dir, opts.limit as number);
    for (const e of entries) {
      console.log(`${e.hash.slice(0, 8)} ${e.date.slice(0, 10)} ${e.author}  ${e.message}`);
    }
  });

const diffCmd = cortexCommand('diff')
  .description('Show working tree diff')
  .option('--agent <agentId:string>', 'Agent workspace ID')
  .option('--stat', 'Show diffstat only')
  .option('--file <file:string>', 'Show diff for specific file')
  .action(async (opts: Record<string, unknown>, _ctx: Ctx) => {
    const dir = await resolveDir(opts.agent as string | undefined);
    const output = opts.stat
      ? await gitDiffStat(dir)
      : await gitDiff(dir, opts.file as string | undefined);
    console.log(output);
  });

const addCmd = cortexCommand('add')
  .description('Stage files')
  .arguments('<paths...:string>')
  .option('--agent <agentId:string>', 'Agent workspace ID')
  .option('--all', 'Stage all changes (git add -A)')
  .action(async (opts: Record<string, unknown>, _ctx: Ctx, ...paths: string[]) => {
    const dir = await resolveDir(opts.agent as string | undefined);
    const files = opts.all ? ['-A'] : paths.flat();
    const ok = await gitAdd(dir, files);
    console.log(ok ? i18n.t('cli.git.staged') : i18n.t('cli.git.failedToStage'));
  });

const commitCmd = cortexCommand('commit')
  .description('Create a commit')
  .arguments('<message:string>')
  .option('--agent <agentId:string>', 'Agent workspace ID')
  .option('--all', 'Stage all changes before commit')
  .action(async (opts: Record<string, unknown>, _ctx: Ctx, message: string) => {
    const dir = await resolveDir(opts.agent as string | undefined);
    if (opts.all) await gitAdd(dir, ['-A']);
    const ok = await gitCommit(dir, message);
    console.log(ok ? i18n.t('cli.git.committed', { message }) : i18n.t('cli.git.nothingToCommit'));
  });

const pushCmd = cortexCommand('push')
  .description('Push to remote')
  .option('--agent <agentId:string>', 'Agent workspace ID')
  .option('--remote <remote:string>', 'Remote name', { default: 'origin' })
  .option('--branch <branch:string>', 'Branch to push')
  .action(async (opts: Record<string, unknown>, _ctx: Ctx) => {
    const dir = await resolveDir(opts.agent as string | undefined);
    const result = await gitPush(dir, opts.remote as string, opts.branch as string | undefined);
    console.log(
      result.success
        ? i18n.t('cli.git.pushSuccessful')
        : i18n.t('cli.git.pushFailed', { output: result.output }),
    );
  });

const pullCmd = cortexCommand('pull')
  .description('Pull from remote')
  .option('--agent <agentId:string>', 'Agent workspace ID')
  .option('--remote <remote:string>', 'Remote name', { default: 'origin' })
  .option('--branch <branch:string>', 'Branch to pull')
  .action(async (opts: Record<string, unknown>, _ctx: Ctx) => {
    const dir = await resolveDir(opts.agent as string | undefined);
    const result = await gitPull(dir, opts.remote as string, opts.branch as string | undefined);
    console.log(
      result.success
        ? i18n.t('cli.git.pullSuccessful')
        : i18n.t('cli.git.pullFailed', { output: result.output }),
    );
  });

const cloneCmd = cortexCommand('clone')
  .description('Clone a repository')
  .arguments('<url:string> <dest:string>')
  .option('--branch <branch:string>', 'Branch to clone')
  .action(async (opts: Record<string, unknown>, _ctx: Ctx, url: string, dest: string) => {
    const result = await gitClone(url, dest, opts.branch as string | undefined);
    console.log(
      result.success
        ? i18n.t('cli.git.cloned', { dest })
        : i18n.t('cli.git.cloneFailed', { output: result.output }),
    );
  });

const branchCmd = cortexCommand('branch')
  .description('List or create/switch branches')
  .option('--agent <agentId:string>', 'Agent workspace ID')
  .option('--create <name:string>', 'Create a new branch')
  .option('--checkout <name:string>', 'Switch to branch')
  .action(async (opts: Record<string, unknown>, _ctx: Ctx) => {
    const dir = await resolveDir(opts.agent as string | undefined);
    if (opts.create) {
      const ok = await gitCreateBranch(dir, opts.create as string);
      return console.log(
        ok
          ? i18n.t('cli.git.createdAndSwitched', { branch: opts.create as string })
          : i18n.t('cli.git.failed'),
      );
    }
    if (opts.checkout) {
      const ok = await gitCheckout(dir, opts.checkout as string);
      return console.log(
        ok
          ? i18n.t('cli.git.switchedTo', { branch: opts.checkout as string })
          : i18n.t('cli.git.failed'),
      );
    }
    const branches = await gitListBranches(dir);
    for (const b of branches) {
      console.log(`${b.current ? '*' : ' '} ${b.name}`);
    }
  });

const remoteCmd = cortexCommand('remote')
  .description('Manage remotes')
  .option('--agent <agentId:string>', 'Agent workspace ID')
  .option('--add <name:string>', 'Add remote')
  .option('--url <url:string>', 'Remote URL (for --add)')
  .action(async (opts: Record<string, unknown>, _ctx: Ctx) => {
    const dir = await resolveDir(opts.agent as string | undefined);
    if (opts.add && opts.url) {
      const ok = await gitAddRemote(dir, opts.add as string, opts.url as string);
      return console.log(
        ok
          ? i18n.t('cli.git.addedRemote', { name: opts.add as string })
          : i18n.t('cli.git.failedAddRemote'),
      );
    }
    const remotes = await gitListRemotes(dir);
    for (const r of remotes) console.log(`${r.name}\t${r.url}`);
  });

export const gitCommand = cortexCommand('git')
  .description('Git workspace operations')
  .action(async () => {
    gitCommand._cmd.showHelp();
  })
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
