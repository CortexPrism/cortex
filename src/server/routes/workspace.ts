import { err, json, type RouteHandler } from './_helpers.ts';
import { dirname } from '@std/path';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/workspace\/agents$/,
    handler: async () => {
      const { getAgentWorkspaceDir } = await import('../../workspace/paths.ts');
      const { listAgents } = await import('../../agent/manager.ts');
      const agents = await listAgents();
      const workspaces = agents.map((a) => ({
        agentId: a.id,
        agentName: a.name,
        workspaceDir: getAgentWorkspaceDir(a.id),
      }));
      return json(workspaces);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/workspace\/agents\/([^/]+)\/ensure$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/workspace\/agents\/([^/]+)\/ensure$/);
      if (!m) return err('Not found', 404);
      const { ensureAgentWorkspace } = await import('../../workspace/paths.ts');
      const dir = await ensureAgentWorkspace(m[1]);
      return json({ ok: true, workspaceDir: dir });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/workspace\/agents\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/workspace\/agents\/([^/]+)$/);
      if (!m) return err('Not found', 404);
      const { getAgentWorkspaceDir } = await import('../../workspace/paths.ts');
      const dir = getAgentWorkspaceDir(m[1]);
      let ex = false;
      try {
        await Deno.stat(dir);
        ex = true;
      } catch { /* doesn't exist */ }
      return json({ agentId: m[1], workspaceDir: dir, exists: ex });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/workspace\/files(\/.*)?$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/workspace\/files(\/.*)?$/);
      if (!m) return err('Not found', 404);
      const { getGlobalWorkspaceDir, resolveWorkspacePath } = await import(
        '../../workspace/paths.ts'
      );
      const relPath = workspaceRelPath(m, 1);
      const targetPath = relPath
        ? resolveWorkspacePath('global', relPath, 'global')
        : getGlobalWorkspaceDir();
      try {
        const stat = await Deno.stat(targetPath);
        if (stat.isDirectory) {
          const entries: string[] = [];
          for await (const entry of Deno.readDir(targetPath)) {
            entries.push(entry.isDirectory ? entry.name + '/' : entry.name);
          }
          return json(entries.sort());
        }
        const content = await Deno.readTextFile(targetPath);
        return json({ content, path: targetPath });
      } catch (e) {
        return err((e as Error).message, 404);
      }
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/workspace\/files(\/.*)?$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/workspace\/files(\/.*)?$/);
      if (!m) return err('Not found', 404);
      const { resolveWorkspacePath } = await import('../../workspace/paths.ts');
      const relPath = workspaceRelPath(m, 1);
      const targetPath = resolveWorkspacePath('global', relPath, 'global');
      const { content } = await req.json() as { content: string };
      const parent = dirname(targetPath);
      if (parent) await Deno.mkdir(parent, { recursive: true });
      await Deno.writeTextFile(targetPath, content);
      return json({ ok: true, path: targetPath });
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/workspace\/files(\/.*)?$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/workspace\/files(\/.*)?$/);
      if (!m) return err('Not found', 404);
      const { resolveWorkspacePath } = await import('../../workspace/paths.ts');
      const relPath = workspaceRelPath(m, 1);
      const targetPath = resolveWorkspacePath('global', relPath, 'global');
      await Deno.remove(targetPath, { recursive: true });
      return json({ ok: true });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/workspace\/agents\/([^/]+)\/files(\/.*)?$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/workspace\/agents\/([^/]+)\/files(\/.*)?$/);
      if (!m) return err('Not found', 404);
      const { ensureAgentWorkspace, getAgentWorkspaceDir, resolveWorkspacePath } = await import(
        '../../workspace/paths.ts'
      );
      const agentId = m[1];
      const relPath = workspaceRelPath(m);
      const targetPath = relPath
        ? resolveWorkspacePath(agentId, relPath, 'agent')
        : await ensureAgentWorkspace(agentId);
      try {
        const stat = await Deno.stat(targetPath);
        if (stat.isDirectory) {
          const entries: string[] = [];
          for await (const entry of Deno.readDir(targetPath)) {
            entries.push(entry.isDirectory ? entry.name + '/' : entry.name);
          }
          return json(entries.sort());
        }
        const content = await Deno.readTextFile(targetPath);
        return json({ content, path: targetPath });
      } catch (e) {
        return err((e as Error).message, 404);
      }
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/workspace\/agents\/([^/]+)\/files(\/.*)?$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/workspace\/agents\/([^/]+)\/files(\/.*)?$/);
      if (!m) return err('Not found', 404);
      const { ensureAgentWorkspace, resolveWorkspacePath } = await import(
        '../../workspace/paths.ts'
      );
      const agentId = m[1];
      await ensureAgentWorkspace(agentId);
      const relPath = workspaceRelPath(m);
      const targetPath = resolveWorkspacePath(agentId, relPath, 'agent');
      const { content } = await req.json() as { content: string };
      const parent = dirname(targetPath);
      if (parent) await Deno.mkdir(parent, { recursive: true });
      await Deno.writeTextFile(targetPath, content);
      return json({ ok: true, path: targetPath });
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/workspace\/agents\/([^/]+)\/files(\/.*)?$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/workspace\/agents\/([^/]+)\/files(\/.*)?$/);
      if (!m) return err('Not found', 404);
      const { ensureAgentWorkspace, resolveWorkspacePath } = await import(
        '../../workspace/paths.ts'
      );
      const agentId = m[1];
      await ensureAgentWorkspace(agentId);
      const relPath = workspaceRelPath(m);
      const targetPath = resolveWorkspacePath(agentId, relPath, 'agent');
      await Deno.remove(targetPath, { recursive: true });
      return json({ ok: true });
    },
  },
];

function workspaceRelPath(match: RegExpMatchArray, group = 2): string {
  return (match[group] ?? '').replace(/^\//, '');
}
