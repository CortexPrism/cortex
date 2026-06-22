import { type RouteHandler, json, notFound, err } from './_helpers.ts';
import { PATHS } from '../../config/paths.ts';
import { join } from '@std/path';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/projects$/,
    handler: async () => {
      const { listProjects } = await import('../../projects/manager.ts');
      return json(await listProjects());
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/projects\/import-github$/,
    handler: async (req) => {
      const body = await req.json() as { fullName: string; projectName?: string; agentId?: string };
      if (!body.fullName) return err('fullName is required (owner/name)', 400);
      const { getGitHubToken, getRepo } = await import('../../workspace/github.ts');
      const token = await getGitHubToken();
      if (!token) return err('GitHub token not configured', 401);
      try {
        const repo = await getRepo(body.fullName, token);
        const name = body.projectName || repo.name;
        if (/[^a-zA-Z0-9_-]/.test(name)) {
          return err('Project name may only contain letters, numbers, hyphens, and underscores', 400);
        }
        const agentId = body.agentId || 'assistant';
        const cloneDir = join(PATHS.workspacesDir, agentId, name);
        await Deno.mkdir(join(PATHS.workspacesDir, agentId), { recursive: true });
        const cmd = new Deno.Command('git', {
          args: ['clone', repo.html_url, cloneDir],
          stdout: 'null',
          stderr: 'null',
        });
        const result = await cmd.output();
        if (!result.success) return err('Failed to clone repository', 500);
        const { createProject: createFsProject } = await import('../../projects/manager.ts');
        const project = await createFsProject(name, {
          description: repo.description || undefined,
          agentId: agentId,
          path: cloneDir,
        });
        try {
          await (await import('../../codegraph/sync.ts')).indexRepository(cloneDir, name);
        } catch (e) {
          return json({ ...project, indexing_warning: (e as Error).message }, 201);
        }
        return json(project, 201);
      } catch (e) {
        return err((e as Error).message, 400);
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/projects$/,
    handler: async (req) => {
      const body = await req.json();
      if (!body.name || typeof body.name !== 'string') {
        return err('name is required', 400);
      }
      if (/[^a-zA-Z0-9_-]/.test(body.name)) {
        return err('name may only contain letters, numbers, hyphens, and underscores', 400);
      }
      const { createProject } = await import('../../projects/manager.ts');
      try {
        const project = await createProject(body.name, {
          agentId: body.agentId,
          description: body.description,
        });
        return json(project, 201);
      } catch (e) {
        return err((e as Error).message, 400);
      }
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/projects\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/projects\/([^/]+)$/);
      if (!m) return notFound();
      const { loadProject } = await import('../../projects/manager.ts');
      const project = await loadProject(m[1]);
      return project ? json(project) : notFound('Project not found');
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/projects\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/projects\/([^/]+)$/);
      if (!m) return notFound();
      const { deleteProject } = await import('../../projects/manager.ts');
      const ok = await deleteProject(m[1]);
      return ok ? json({ ok: true }) : notFound('Project not found');
    },
  },
];
