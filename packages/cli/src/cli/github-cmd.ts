import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import {
  createIssue,
  createPullRequest,
  getGitHubToken,
  getPullRequest,
  getRepo,
  listBranches,
  listIssues,
  listPullRequests,
  listRepos,
  mergePullRequest,
  updateIssue,
  updatePullRequest,
} from '../../../../src/workspace/github.ts';
import { i18n } from '../../../../src/i18n/service.ts';

async function requireToken(): Promise<string> {
  const token = await getGitHubToken();
  if (!token) {
    console.error(
      i18n.t('cli.github.noTokenFound'),
    );
    Deno.exit(1);
  }
  return token;
}

function printPR(pr: {
  number: number;
  title: string;
  state: string;
  html_url: string;
  user: { login: string };
  head: { ref: string };
  base: { ref: string };
  draft?: boolean;
}): void {
  console.log(`#${pr.number} [${pr.state}]${pr.draft ? ' [DRAFT]' : ''} ${pr.title}`);
  console.log(`  ${pr.html_url}`);
  console.log(`  @${pr.user.login} · ${pr.head.ref} → ${pr.base.ref}`);
}

// ── PR subcommands ──
const prListCmd = cortexCommand('list')
  .description('List pull requests')
  .arguments('<repo:string>')
  .option('--state <state:string>', 'Filter: open, closed, all', { default: 'open' })
  .option('--limit <limit:number>', 'Max results', { default: 10 })
  .action(async (opts: Record<string, unknown>, _ctx: Ctx, repo: string) => {
    const token = await requireToken();
    const prs = await listPullRequests(repo, token, {
      state: opts.state as 'open' | 'closed' | 'all',
      limit: opts.limit as number,
    });
    if (prs.length === 0) {
      console.log(i18n.t('cli.github.noPullRequests'));
      return;
    }
    for (const pr of prs) printPR(pr);
  });

const prGetCmd = cortexCommand('get')
  .description('Get pull request details')
  .arguments('<repo:string> <pr-number:number>')
  .action(async (_opts: Record<string, unknown>, _ctx: Ctx, repo: string, prNumber: string) => {
    const token = await requireToken();
    const pr = await getPullRequest(repo, token, Number(prNumber));
    printPR(pr);
    console.log(`Created: ${pr.created_at}`);
    console.log(`Updated: ${pr.updated_at}`);
    if (pr.body) console.log(`\nBody:\n${pr.body}`);
  });

const prCreateCmd = cortexCommand('create')
  .description('Create a pull request')
  .arguments('<repo:string> <title:string> <head:string> <base:string>')
  .option('--body <body:string>', 'PR body text')
  .option('--draft', 'Create as draft PR')
  .action(
    async (
      opts: Record<string, unknown>,
      _ctx: Ctx,
      repo: string,
      title: string,
      head: string,
      base: string,
    ) => {
      const token = await requireToken();
      const pr = await createPullRequest(repo, token, {
        title,
        head,
        base,
        body: (opts.body as string) ?? '',
        draft: !!opts.draft,
      });
      console.log(
        i18n.t('cli.github.createdPr', { number: String(pr.number), url: pr.html_url }),
      );
    },
  );

const prMergeCmd = cortexCommand('merge')
  .description('Merge a pull request')
  .arguments('<repo:string> <pr-number:number>')
  .option('--method <method:string>', 'Merge method: merge, squash, rebase', {
    default: 'merge',
  })
  .action(async (opts: Record<string, unknown>, _ctx: Ctx, repo: string, prNumber: string) => {
    const token = await requireToken();
    const result = await mergePullRequest(repo, token, Number(prNumber), {
      mergeMethod: opts.method as 'merge' | 'squash' | 'rebase',
    });
    console.log(
      result.merged
        ? i18n.t('cli.github.prMerged', { number: prNumber, sha: result.sha })
        : i18n.t('cli.github.prNotMerged'),
    );
  });

const prCloseCmd = cortexCommand('close')
  .description('Close a pull request without merging')
  .arguments('<repo:string> <pr-number:number>')
  .action(async (_opts: Record<string, unknown>, _ctx: Ctx, repo: string, prNumber: string) => {
    const token = await requireToken();
    await updatePullRequest(repo, token, Number(prNumber), { state: 'closed' });
    console.log(i18n.t('cli.github.prClosed', { number: prNumber }));
  });

const prCmd = cortexCommand('pr')
  .description('Manage pull requests')
  .action(async () => {
    prCmd._cmd.showHelp();
  })
  .command('list', prListCmd)
  .command('get', prGetCmd)
  .command('create', prCreateCmd)
  .command('merge', prMergeCmd)
  .command('close', prCloseCmd);

// ── Issue subcommands ──
const issueListCmd = cortexCommand('list')
  .description('List issues')
  .arguments('<repo:string>')
  .option('--state <state:string>', 'Filter: open, closed, all', { default: 'open' })
  .option('--limit <limit:number>', 'Max results', { default: 10 })
  .option('--labels <labels:string>', 'Comma-separated labels')
  .action(async (opts: Record<string, unknown>, _ctx: Ctx, repo: string) => {
    const token = await requireToken();
    const issues = await listIssues(repo, token, {
      state: opts.state as 'open' | 'closed' | 'all',
      limit: opts.limit as number,
      labels: opts.labels ? (opts.labels as string).split(',') : undefined,
    });
    if (issues.length === 0) {
      console.log(i18n.t('cli.github.noIssues'));
      return;
    }
    for (const issue of issues) {
      const labelsStr = issue.labels.map((l) => l.name).join(', ');
      console.log(`#${issue.number} [${issue.state}] ${issue.title}`);
      if (labelsStr) console.log(`  Labels: ${labelsStr}`);
      console.log(`  ${issue.html_url}`);
    }
  });

const issueCreateCmd = cortexCommand('create')
  .description('Create an issue')
  .arguments('<repo:string> <title:string>')
  .option('--body <body:string>', 'Issue body')
  .option('--labels <labels:string>', 'Comma-separated labels')
  .option('--assignees <assignees:string>', 'Comma-separated assignees')
  .action(async (opts: Record<string, unknown>, _ctx: Ctx, repo: string, title: string) => {
    const token = await requireToken();
    const issue = await createIssue(repo, token, {
      title,
      body: (opts.body as string) ?? '',
      labels: opts.labels ? (opts.labels as string).split(',') : undefined,
      assignees: opts.assignees ? (opts.assignees as string).split(',') : undefined,
    });
    console.log(
      i18n.t('cli.github.createdIssue', {
        number: String(issue.number),
        url: issue.html_url,
      }),
    );
  });

const issueCloseCmd = cortexCommand('close')
  .description('Close an issue')
  .arguments('<repo:string> <issue-number:number>')
  .action(async (_opts: Record<string, unknown>, _ctx: Ctx, repo: string, issueNumber: string) => {
    const token = await requireToken();
    await updateIssue(repo, token, Number(issueNumber), { state: 'closed' });
    console.log(i18n.t('cli.github.issueClosed', { number: issueNumber }));
  });

const issueCmd = cortexCommand('issue')
  .description('Manage issues')
  .action(async () => {
    issueCmd._cmd.showHelp();
  })
  .command('list', issueListCmd)
  .command('create', issueCreateCmd)
  .command('close', issueCloseCmd);

// ── Repo subcommands ──
const repoListCmd = cortexCommand('list')
  .description('List repositories')
  .option('--type <type:string>', 'Type: all, owner, public, private', { default: 'all' })
  .option('--limit <limit:number>', 'Max results', { default: 20 })
  .action(async (opts: Record<string, unknown>, _ctx: Ctx) => {
    const token = await requireToken();
    const repos = await listRepos(token, {
      type: opts.type as 'all' | 'owner' | 'public' | 'private',
      limit: opts.limit as number,
    });
    if (repos.length === 0) {
      console.log(i18n.t('cli.github.noRepositories'));
      return;
    }
    for (const repo of repos) {
      console.log(`${repo.full_name} ${repo.private ? '(private)' : '(public)'}`);
      console.log(`  ${repo.html_url}`);
      if (repo.description) console.log(`  ${repo.description}`);
      console.log(`  ⭐ ${repo.stargazers_count} · Issues: ${repo.open_issues_count}`);
    }
  });

const repoGetCmd = cortexCommand('get')
  .description('Get repository details')
  .arguments('<repo:string>')
  .action(async (_opts: Record<string, unknown>, _ctx: Ctx, repo: string) => {
    const token = await requireToken();
    const r = await getRepo(repo, token);
    console.log(`${r.full_name}`);
    console.log(`URL: ${r.html_url}`);
    console.log(`Default branch: ${r.default_branch}`);
    console.log(`Private: ${r.private}`);
    console.log(`Description: ${r.description ?? '(none)'}`);
    console.log(
      `Stars: ${r.stargazers_count} · Issues: ${r.open_issues_count} · Forks: ${r.fork}`,
    );
  });

const repoBranchesCmd = cortexCommand('branches')
  .description('List repository branches')
  .arguments('<repo:string>')
  .option('--limit <limit:number>', 'Max results', { default: 30 })
  .action(async (opts: Record<string, unknown>, _ctx: Ctx, repo: string) => {
    const token = await requireToken();
    const branches = await listBranches(repo, token, opts.limit as number);
    for (const b of branches) {
      console.log(`${b.protected ? '[protected]' : '[normal]   '} ${b.name}`);
    }
  });

const repoCmd = cortexCommand('repo')
  .description('Manage repositories')
  .action(async () => {
    repoCmd._cmd.showHelp();
  })
  .command('list', repoListCmd)
  .command('get', repoGetCmd)
  .command('branches', repoBranchesCmd);

// ── Token subcommand ──
const tokenCmd = cortexCommand('token')
  .description('Check GitHub token status')
  .action(async () => {
    const token = await getGitHubToken();
    if (token) {
      const masked = token.slice(0, 8) + '...' + token.slice(-4);
      console.log(i18n.t('cli.github.tokenFound', { masked }));
      console.log(i18n.t('cli.github.tokenSourcesCheck'));
    } else {
      console.log(i18n.t('cli.github.noToken'));
      console.log(i18n.t('cli.github.setVia'));
      console.log(i18n.t('cli.github.setViaEnv'));
      console.log(i18n.t('cli.github.setViaConfig'));
      console.log(i18n.t('cli.github.setViaVault'));
    }
  });

export const githubCommand = cortexCommand('github')
  .description('GitHub integration — PRs, issues, repos')
  .action(async () => {
    githubCommand._cmd.showHelp();
  })
  .command('pr', prCmd)
  .command('issue', issueCmd)
  .command('repo', repoCmd)
  .command('token', tokenCmd);
