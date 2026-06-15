export interface GitHubPR {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed' | 'merged';
  head: { ref: string; sha: string };
  base: { ref: string; sha: string };
  html_url: string;
  created_at: string;
  updated_at: string;
  user: { login: string };
  draft?: boolean;
  mergeable?: boolean | null;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  html_url: string;
  created_at: string;
  updated_at: string;
  user: { login: string };
  labels: Array<{ name: string; color: string }>;
  assignees: Array<{ login: string }>;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  default_branch: string;
  private: boolean;
  fork: boolean;
  open_issues_count: number;
  stargazers_count: number;
  forks_count: number;
}

export interface GitHubBranch {
  name: string;
  commit: { sha: string; url: string };
  protected: boolean;
}

export interface GitHubCommitStatus {
  state: 'success' | 'failure' | 'pending' | 'error';
  context: string;
  description: string | null;
  target_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface GitHubCheckRun {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: string | null;
  html_url: string;
  started_at: string;
  completed_at: string | null;
}

function ghUrl(repo: string, path: string): string {
  return `https://api.github.com/repos/${repo}${path}`;
}

async function ghFetch(
  url: string,
  token: string,
  options: RequestInit = {},
): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'cortex-agentic-harness',
      ...((options.headers as Record<string, string>) ?? {}),
    },
  });
  return res;
}

async function ghPaginated<T>(
  url: string,
  token: string,
  limit = 30,
): Promise<T[]> {
  const items: T[] = [];
  let page = 1;
  while (items.length < limit) {
    const sep = url.includes('?') ? '&' : '?';
    const res = await ghFetch(`${url}${sep}per_page=100&page=${page}`, token);
    if (!res.ok) {
      throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
    }
    const batch: T[] = await res.json();
    items.push(...batch);
    if (batch.length < 100) break;
    page++;
  }
  return items.slice(0, limit);
}

export async function getGitHubToken(): Promise<string | null> {
  try {
    const { loadConfig } = await import('../config/config.ts');
    const config = await loadConfig() as unknown as Record<string, unknown>;
    const ghToken = config.githubToken as string | undefined;
    if (ghToken) return ghToken;
  } catch { /* ignore */ }

  try {
    const envToken = Deno.env.get('GITHUB_TOKEN') || Deno.env.get('GH_TOKEN');
    if (envToken) return envToken;
  } catch { /* ignore */ }

  try {
    const { vaultGet } = await import('../security/vault.ts');
    return await vaultGet('github_token');
  } catch { /* ignore */ }

  return null;
}

export async function listPullRequests(
  repo: string,
  token: string,
  opts: { state?: 'open' | 'closed' | 'all'; limit?: number } = {},
): Promise<GitHubPR[]> {
  const state = opts.state ?? 'open';
  const items = await ghPaginated<GitHubPR>(
    ghUrl(repo, `/pulls?state=${state}`),
    token,
    opts.limit ?? 30,
  );
  return items;
}

export async function getPullRequest(
  repo: string,
  token: string,
  prNumber: number,
): Promise<GitHubPR> {
  const res = await ghFetch(ghUrl(repo, `/pulls/${prNumber}`), token);
  if (!res.ok) throw new Error(`Failed to get PR #${prNumber}: ${await res.text()}`);
  return await res.json();
}

export async function createPullRequest(
  repo: string,
  token: string,
  opts: { title: string; body: string; head: string; base: string; draft?: boolean },
): Promise<GitHubPR> {
  const res = await ghFetch(ghUrl(repo, `/pulls`), token, {
    method: 'POST',
    body: JSON.stringify({
      title: opts.title,
      body: opts.body,
      head: opts.head,
      base: opts.base,
      draft: opts.draft ?? false,
    }),
  });
  if (!res.ok) throw new Error(`Failed to create PR: ${await res.text()}`);
  return await res.json();
}

export async function mergePullRequest(
  repo: string,
  token: string,
  prNumber: number,
  opts: { mergeMethod?: 'merge' | 'squash' | 'rebase'; commitTitle?: string } = {},
): Promise<{ merged: boolean; sha: string }> {
  const res = await ghFetch(ghUrl(repo, `/pulls/${prNumber}/merge`), token, {
    method: 'PUT',
    body: JSON.stringify({
      merge_method: opts.mergeMethod ?? 'merge',
      commit_title: opts.commitTitle,
    }),
  });
  const body = await res.json();
  return { merged: body.merged ?? false, sha: body.sha ?? '' };
}

export async function updatePullRequest(
  repo: string,
  token: string,
  prNumber: number,
  opts: { title?: string; body?: string; state?: 'open' | 'closed' },
): Promise<GitHubPR> {
  const res = await ghFetch(ghUrl(repo, `/pulls/${prNumber}`), token, {
    method: 'PATCH',
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error(`Failed to update PR #${prNumber}: ${await res.text()}`);
  return await res.json();
}

export async function listIssues(
  repo: string,
  token: string,
  opts: { state?: 'open' | 'closed' | 'all'; limit?: number; labels?: string[] } = {},
): Promise<GitHubIssue[]> {
  let path = `/issues?state=${opts.state ?? 'open'}&sort=updated&direction=desc`;
  if (opts.labels?.length) path += `&labels=${opts.labels.join(',')}`;
  const items = await ghPaginated<GitHubIssue>(
    ghUrl(repo, path),
    token,
    opts.limit ?? 30,
  );
  return items;
}

export async function createIssue(
  repo: string,
  token: string,
  opts: { title: string; body: string; labels?: string[]; assignees?: string[] },
): Promise<GitHubIssue> {
  const res = await ghFetch(ghUrl(repo, `/issues`), token, {
    method: 'POST',
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error(`Failed to create issue: ${await res.text()}`);
  return await res.json();
}

export async function updateIssue(
  repo: string,
  token: string,
  issueNumber: number,
  opts: { title?: string; body?: string; state?: 'open' | 'closed'; labels?: string[] },
): Promise<GitHubIssue> {
  const res = await ghFetch(ghUrl(repo, `/issues/${issueNumber}`), token, {
    method: 'PATCH',
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error(`Failed to update issue #${issueNumber}: ${await res.text()}`);
  return await res.json();
}

export async function listRepos(
  token: string,
  opts: { type?: 'all' | 'owner' | 'public' | 'private'; limit?: number } = {},
): Promise<GitHubRepo[]> {
  const type = opts.type ?? 'all';
  const items = await ghPaginated<GitHubRepo>(
    `https://api.github.com/user/repos?type=${type}&sort=updated&direction=desc`,
    token,
    opts.limit ?? 30,
  );
  return items;
}

export async function getRepo(
  repo: string,
  token: string,
): Promise<GitHubRepo> {
  const res = await ghFetch(ghUrl(repo, ''), token);
  if (!res.ok) throw new Error(`Failed to get repo ${repo}: ${await res.text()}`);
  return await res.json();
}

export async function listBranches(
  repo: string,
  token: string,
  limit = 30,
): Promise<GitHubBranch[]> {
  return await ghPaginated<GitHubBranch>(
    ghUrl(repo, '/branches'),
    token,
    limit,
  );
}

export async function createBranch(
  repo: string,
  token: string,
  opts: { name: string; sha: string },
): Promise<GitHubBranch> {
  const res = await ghFetch(ghUrl(repo, '/git/refs'), token, {
    method: 'POST',
    body: JSON.stringify({
      ref: `refs/heads/${opts.name}`,
      sha: opts.sha,
    }),
  });
  if (!res.ok) throw new Error(`Failed to create branch: ${await res.text()}`);
  return await res.json();
}

export async function listCommitStatuses(
  repo: string,
  token: string,
  ref: string,
): Promise<GitHubCommitStatus[]> {
  const res = await ghFetch(ghUrl(repo, `/commits/${ref}/statuses`), token);
  if (!res.ok) throw new Error(`Failed to get statuses: ${await res.text()}`);
  return await res.json();
}

export async function listCheckRuns(
  repo: string,
  token: string,
  ref: string,
): Promise<GitHubCheckRun[]> {
  const res = await ghFetch(ghUrl(repo, `/commits/${ref}/check-runs`), token);
  if (!res.ok) throw new Error(`Failed to get check runs: ${await res.text()}`);
  const body = await res.json();
  return body.check_runs ?? [];
}
