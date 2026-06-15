import { Command } from '@cliffy/command';
import {
  getGitHubToken,
  listPullRequests,
  getPullRequest,
  createPullRequest,
  mergePullRequest,
  updatePullRequest,
  listIssues,
  createIssue,
  updateIssue,
  listRepos,
  getRepo,
  listBranches,
} from '../workspace/github.ts';

async function requireToken(): Promise<string> {
  const token = await getGitHubToken();
  if (!token) {
    console.error(
      'GitHub token not found. Set GITHUB_TOKEN env, githubToken in config, or vault entry "github_token".',
    );
    Deno.exit(1);
  }
  return token;
}

function printPR(pr: {
  number: number; title: string; state: string; html_url: string;
  user: { login: string }; head: { ref: string }; base: { ref: string }; draft?: boolean;
}): void {
  console.log(`#${pr.number} [${pr.state}]${pr.draft ? ' [DRAFT]' : ''} ${pr.title}`);
  console.log(`  ${pr.html_url}`);
  console.log(`  @${pr.user.login} · ${pr.head.ref} → ${pr.base.ref}`);
}

export const githubCommand = new Command()
  .description('GitHub integration — PRs, issues, repos');

// ── PR subcommands ──
const prCmd = new Command()
  .description('Manage pull requests');

prCmd
  .command('list', new Command()
    .description('List pull requests')
    .arguments('<repo:string>')
    .option('--state <state:string>', 'Filter: open, closed, all', { default: 'open' })
    .option('--limit <limit:number>', 'Max results', { default: 10 })
    .action(async (opts: { state: string; limit: number }, repo: string) => {
      const token = await requireToken();
      const prs = await listPullRequests(repo, token, { state: opts.state as 'open' | 'closed' | 'all', limit: opts.limit });
      if (prs.length === 0) { console.log('No pull requests found.'); return; }
      for (const pr of prs) printPR(pr);
    }));

prCmd
  .command('get', new Command()
    .description('Get pull request details')
    .arguments('<repo:string> <pr-number:number>')
    .action(async (_opts: unknown, repo: string, prNumber: number) => {
      const token = await requireToken();
      const pr = await getPullRequest(repo, token, prNumber);
      printPR(pr);
      console.log(`Created: ${pr.created_at}`);
      console.log(`Updated: ${pr.updated_at}`);
      if (pr.body) console.log(`\nBody:\n${pr.body}`);
    }));

prCmd
  .command('create', new Command()
    .description('Create a pull request')
    .arguments('<repo:string> <title:string> <head:string> <base:string>')
    .option('--body <body:string>', 'PR body text')
    .option('--draft', 'Create as draft PR')
    .action(async (opts: { body?: string; draft?: boolean }, repo: string, title: string, head: string, base: string) => {
      const token = await requireToken();
      const pr = await createPullRequest(repo, token, { title, head, base, body: opts.body ?? '', draft: !!opts.draft });
      console.log(`Created PR #${pr.number}: ${pr.html_url}`);
    }));

prCmd
  .command('merge', new Command()
    .description('Merge a pull request')
    .arguments('<repo:string> <pr-number:number>')
    .option('--method <method:string>', 'Merge method: merge, squash, rebase', { default: 'merge' })
    .action(async (opts: { method: string }, repo: string, prNumber: number) => {
      const token = await requireToken();
      const result = await mergePullRequest(repo, token, prNumber, { mergeMethod: opts.method as 'merge' | 'squash' | 'rebase' });
      console.log(result.merged ? `PR #${prNumber} merged. SHA: ${result.sha}` : 'PR could not be merged.');
    }));

prCmd
  .command('close', new Command()
    .description('Close a pull request without merging')
    .arguments('<repo:string> <pr-number:number>')
    .action(async (_opts: unknown, repo: string, prNumber: number) => {
      const token = await requireToken();
      await updatePullRequest(repo, token, prNumber, { state: 'closed' });
      console.log(`PR #${prNumber} closed.`);
    }));

// ── Issue subcommands ──
const issueCmd = new Command()
  .description('Manage issues');

issueCmd
  .command('list', new Command()
    .description('List issues')
    .arguments('<repo:string>')
    .option('--state <state:string>', 'Filter: open, closed, all', { default: 'open' })
    .option('--limit <limit:number>', 'Max results', { default: 10 })
    .option('--labels <labels:string>', 'Comma-separated labels')
    .action(async (opts: { state: string; limit: number; labels?: string }, repo: string) => {
      const token = await requireToken();
      const issues = await listIssues(repo, token, {
        state: opts.state as 'open' | 'closed' | 'all',
        limit: opts.limit,
        labels: opts.labels ? opts.labels.split(',') : undefined,
      });
      if (issues.length === 0) { console.log('No issues found.'); return; }
      for (const issue of issues) {
        const labelsStr = issue.labels.map((l) => l.name).join(', ');
        console.log(`#${issue.number} [${issue.state}] ${issue.title}`);
        if (labelsStr) console.log(`  Labels: ${labelsStr}`);
        console.log(`  ${issue.html_url}`);
      }
    }));

issueCmd
  .command('create', new Command()
    .description('Create an issue')
    .arguments('<repo:string> <title:string>')
    .option('--body <body:string>', 'Issue body')
    .option('--labels <labels:string>', 'Comma-separated labels')
    .option('--assignees <assignees:string>', 'Comma-separated assignees')
    .action(async (opts: { body?: string; labels?: string; assignees?: string }, repo: string, title: string) => {
      const token = await requireToken();
      const issue = await createIssue(repo, token, {
        title,
        body: opts.body ?? '',
        labels: opts.labels ? opts.labels.split(',') : undefined,
        assignees: opts.assignees ? opts.assignees.split(',') : undefined,
      });
      console.log(`Created issue #${issue.number}: ${issue.html_url}`);
    }));

issueCmd
  .command('close', new Command()
    .description('Close an issue')
    .arguments('<repo:string> <issue-number:number>')
    .action(async (_opts: unknown, repo: string, issueNumber: number) => {
      const token = await requireToken();
      await updateIssue(repo, token, issueNumber, { state: 'closed' });
      console.log(`Issue #${issueNumber} closed.`);
    }));

// ── Repo subcommands ──
const repoCmd = new Command()
  .description('Manage repositories');

repoCmd
  .command('list', new Command()
    .description('List repositories')
    .option('--type <type:string>', 'Type: all, owner, public, private', { default: 'all' })
    .option('--limit <limit:number>', 'Max results', { default: 20 })
    .action(async (opts: { type: string; limit: number }) => {
      const token = await requireToken();
      const repos = await listRepos(token, { type: opts.type as 'all' | 'owner' | 'public' | 'private', limit: opts.limit });
      if (repos.length === 0) { console.log('No repositories found.'); return; }
      for (const repo of repos) {
        console.log(`${repo.full_name} ${repo.private ? '(private)' : '(public)'}`);
        console.log(`  ${repo.html_url}`);
        if (repo.description) console.log(`  ${repo.description}`);
        console.log(`  ⭐ ${repo.stargazers_count} · Issues: ${repo.open_issues_count}`);
      }
    }));

repoCmd
  .command('get', new Command()
    .description('Get repository details')
    .arguments('<repo:string>')
    .action(async (_opts: unknown, repo: string) => {
      const token = await requireToken();
      const r = await getRepo(repo, token);
      console.log(`${r.full_name}`);
      console.log(`URL: ${r.html_url}`);
      console.log(`Default branch: ${r.default_branch}`);
      console.log(`Private: ${r.private}`);
      console.log(`Description: ${r.description ?? '(none)'}`);
      console.log(`Stars: ${r.stargazers_count} · Issues: ${r.open_issues_count} · Forks: ${r.fork}`);
    }));

repoCmd
  .command('branches', new Command()
    .description('List repository branches')
    .arguments('<repo:string>')
    .option('--limit <limit:number>', 'Max results', { default: 30 })
    .action(async (opts: { limit: number }, repo: string) => {
      const token = await requireToken();
      const branches = await listBranches(repo, token, opts.limit);
      for (const b of branches) console.log(`${b.protected ? '[protected]' : '[normal]   '} ${b.name}`);
    }));

// ── Token subcommand ──
const tokenCmd = new Command()
  .description('Check GitHub token status')
  .action(async () => {
    const token = await getGitHubToken();
    if (token) {
      const masked = token.slice(0, 8) + '...' + token.slice(-4);
      console.log(`GitHub token found: ${masked}`);
      console.log('Token sources checked: config.json, GITHUB_TOKEN env, vault');
    } else {
      console.log('No GitHub token found.');
      console.log('Set via:');
      console.log('  1. GITHUB_TOKEN environment variable');
      console.log('  2. githubToken in config.json');
      console.log('  3. Vault entry named "github_token" (cortex vault add github_token)');
    }
  });

// Register all subcommands
githubCommand
  .command('pr', prCmd)
  .command('issue', issueCmd)
  .command('repo', repoCmd)
  .command('token', tokenCmd);
