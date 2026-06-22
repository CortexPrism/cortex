import { json, type RouteHandler } from './_helpers.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/workspace\/git\/status$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const agentId = url.searchParams.get('agentId') ?? undefined;
      const { getAgentWorkspaceDir, getGlobalWorkspaceDir } = await import(
        '../../workspace/paths.ts'
      );
      const dir = agentId ? getAgentWorkspaceDir(agentId) : getGlobalWorkspaceDir();
      const { gitStatus } = await import('../../workspace/git.ts');
      const status = await gitStatus(dir);
      return json(status);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/workspace\/git\/commit$/,
    handler: async (req) => {
      const body = await req.json().catch(() => ({})) as { message?: string; agentId?: string };
      const { getAgentWorkspaceDir, getGlobalWorkspaceDir } = await import(
        '../../workspace/paths.ts'
      );
      const dir = body.agentId ? getAgentWorkspaceDir(body.agentId) : getGlobalWorkspaceDir();
      const { gitAdd, gitCommit } = await import('../../workspace/git.ts');
      await gitAdd(dir, ['-A']);
      const ok = await gitCommit(dir, body.message ?? 'web commit');
      return json({ ok, output: ok ? 'Committed' : 'Nothing to commit' });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/workspace\/git\/push$/,
    handler: async (req) => {
      const body = await req.json().catch(() => ({})) as {
        agentId?: string;
        remote?: string;
        branch?: string;
      };
      const { getAgentWorkspaceDir, getGlobalWorkspaceDir } = await import(
        '../../workspace/paths.ts'
      );
      const dir = body.agentId ? getAgentWorkspaceDir(body.agentId) : getGlobalWorkspaceDir();
      const { gitPush } = await import('../../workspace/git.ts');
      const result = await gitPush(dir, body.remote ?? 'origin', body.branch);
      return json({ ok: result.success, output: result.output });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/workspace\/git\/pull$/,
    handler: async (req) => {
      const body = await req.json().catch(() => ({})) as {
        agentId?: string;
        remote?: string;
        branch?: string;
      };
      const { getAgentWorkspaceDir, getGlobalWorkspaceDir } = await import(
        '../../workspace/paths.ts'
      );
      const dir = body.agentId ? getAgentWorkspaceDir(body.agentId) : getGlobalWorkspaceDir();
      const { gitPull } = await import('../../workspace/git.ts');
      const result = await gitPull(dir, body.remote ?? 'origin', body.branch);
      return json({ ok: result.success, output: result.output });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/workspace\/git\/log$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const agentId = url.searchParams.get('agentId') ?? undefined;
      const { getAgentWorkspaceDir, getGlobalWorkspaceDir } = await import(
        '../../workspace/paths.ts'
      );
      const dir = agentId ? getAgentWorkspaceDir(agentId) : getGlobalWorkspaceDir();
      const { gitLog } = await import('../../workspace/git.ts');
      const log = await gitLog(dir);
      return json(log);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/workspace\/git\/branches$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const agentId = url.searchParams.get('agentId') ?? undefined;
      const { getAgentWorkspaceDir, getGlobalWorkspaceDir } = await import(
        '../../workspace/paths.ts'
      );
      const dir = agentId ? getAgentWorkspaceDir(agentId) : getGlobalWorkspaceDir();
      const { gitListBranches } = await import('../../workspace/git.ts');
      const branches = await gitListBranches(dir);
      return json(branches);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/workspace\/git\/branch$/,
    handler: async (req) => {
      const body = await req.json() as { agentId?: string; name: string; create?: boolean };
      const { getAgentWorkspaceDir, getGlobalWorkspaceDir } = await import(
        '../../workspace/paths.ts'
      );
      const dir = body.agentId ? getAgentWorkspaceDir(body.agentId) : getGlobalWorkspaceDir();
      const { gitCreateBranch, gitCheckout } = await import('../../workspace/git.ts');
      const ok = body.create
        ? await gitCreateBranch(dir, body.name)
        : await gitCheckout(dir, body.name);
      return json({ ok });
    },
  },
];
