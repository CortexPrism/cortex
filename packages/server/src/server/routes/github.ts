import { type RouteHandler, json, err } from './_helpers.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/github\/token$/,
    handler: async () => {
      const { getGitHubToken } = await import('../../workspace/github.ts');
      const token = await getGitHubToken();
      return json({ configured: !!token });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/github\/repos$/,
    handler: async () => {
      const { getGitHubToken, listRepos } = await import('../../workspace/github.ts');
      const token = await getGitHubToken();
      if (!token) return err('GitHub token not configured', 401);
      const repos = await listRepos(token, { limit: 30 });
      return json(repos);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/github\/repos\/([^/]+)\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/github\/repos\/([^/]+)\/([^/]+)$/);
      if (!m) return err('Not found', 404);
      const { getGitHubToken, getRepo } = await import('../../workspace/github.ts');
      const token = await getGitHubToken();
      if (!token) return err('GitHub token not configured', 401);
      const repo = await getRepo(`${m[1]}/${m[2]}`, token);
      return json(repo);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/github\/repos\/([^/]+)\/([^/]+)\/pulls$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/github\/repos\/([^/]+)\/([^/]+)\/pulls$/);
      if (!m) return err('Not found', 404);
      const url = new URL(req.url);
      const { getGitHubToken, listPullRequests } = await import('../../workspace/github.ts');
      const token = await getGitHubToken();
      if (!token) return err('GitHub token not configured', 401);
      const state = (url.searchParams.get('state') ?? 'open') as 'open' | 'closed' | 'all';
      const prs = await listPullRequests(`${m[1]}/${m[2]}`, token, { state });
      return json(prs);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/github\/repos\/([^/]+)\/([^/]+)\/issues$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/github\/repos\/([^/]+)\/([^/]+)\/issues$/);
      if (!m) return err('Not found', 404);
      const url = new URL(req.url);
      const { getGitHubToken, listIssues } = await import('../../workspace/github.ts');
      const token = await getGitHubToken();
      if (!token) return err('GitHub token not configured', 401);
      const state = (url.searchParams.get('state') ?? 'open') as 'open' | 'closed' | 'all';
      const issues = await listIssues(`${m[1]}/${m[2]}`, token, { state, limit: 30 });
      return json(issues);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/github\/repos\/([^/]+)\/([^/]+)\/branches$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/github\/repos\/([^/]+)\/([^/]+)\/branches$/);
      if (!m) return err('Not found', 404);
      const { getGitHubToken, listBranches } = await import('../../workspace/github.ts');
      const token = await getGitHubToken();
      if (!token) return err('GitHub token not configured', 401);
      const branches = await listBranches(`${m[1]}/${m[2]}`, token);
      return json(branches);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/workspace\/agents\/([^/]+)\/git\/log$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/workspace\/agents\/([^/]+)\/git\/log$/);
      if (!m) return err('Not found', 404);
      const { getAgentWorkspaceDir } = await import('../../workspace/paths.ts');
      const dir = getAgentWorkspaceDir(m[1]);
      try {
        const cmd = new Deno.Command('git', {
          args: ['-C', dir, 'log', '--oneline', '-20'],
          stdout: 'piped', stderr: 'null',
        });
        const result = await cmd.output();
        const log = new TextDecoder().decode(result.stdout).trim();
        return json({ log: log || '(no commits)' });
      } catch {
        return json({ log: '(git unavailable)' });
      }
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/workspace\/agents\/([^/]+)\/git\/diff$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/workspace\/agents\/([^/]+)\/git\/diff$/);
      if (!m) return err('Not found', 404);
      const { getAgentWorkspaceDir } = await import('../../workspace/paths.ts');
      const dir = getAgentWorkspaceDir(m[1]);
      try {
        const cmd = new Deno.Command('git', {
          args: ['-C', dir, 'diff', '--stat'],
          stdout: 'piped', stderr: 'null',
        });
        const result = await cmd.output();
        const diff = new TextDecoder().decode(result.stdout).trim();
        return json({ diff: diff || '(clean)' });
      } catch {
        return json({ diff: '(git unavailable)' });
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/workspace\/agents\/([^/]+)\/git\/commit$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/workspace\/agents\/([^/]+)\/git\/commit$/);
      if (!m) return err('Not found', 404);
      const { getAgentWorkspaceDir } = await import('../../workspace/paths.ts');
      const dir = getAgentWorkspaceDir(m[1]);
      const body = await req.json().catch(() => ({})) as { message?: string };
      const msg = body.message ?? 'manual commit';
      try {
        const addCmd = new Deno.Command('git', {
          args: ['-C', dir, 'add', '-A'], stdout: 'null', stderr: 'null',
        });
        await addCmd.output();
        const commitCmd = new Deno.Command('git', {
          args: ['-C', dir, 'commit', '--no-gpg-sign', '-m', msg, '--allow-empty'],
          stdout: 'piped', stderr: 'piped',
        });
        const result = await commitCmd.output();
        const out = new TextDecoder().decode(result.stdout).trim();
        return json({ ok: result.success, output: out });
      } catch (e) {
        return err((e as Error).message);
      }
    },
  },
];
