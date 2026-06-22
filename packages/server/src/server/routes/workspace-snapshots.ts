import { type RouteHandler, json, notFound, err, type savePartialProfile } from './_helpers.ts';
import type { SandboxRuntime } from '../../../../../src/sandbox/executor.ts';
import type { loadConfig } from '../../../../../src/config/config.ts';
import type { join } from '@std/path';

const validateSandboxPath = async (inputPath: string, fieldName: string): Promise<string | null> => {
  if (!inputPath || inputPath.includes('..')) {
    return `Invalid ${fieldName}: path traversal not allowed`;
  }
  const { normalize, resolve } = await import('@std/path');
  const { PATHS } = await import('../../../../../src/config/paths.ts');
  const normalized = normalize(resolve(inputPath));
  const roots = [
    normalize(resolve(PATHS.workspacesDir)),
    normalize(resolve(PATHS.dataDir)),
    normalize(resolve(Deno.cwd())),
  ];
  const within = roots.some((r) =>
    normalized === r || (normalized.startsWith(r + '/') || normalized.startsWith(r + '\\'))
  );
  if (!within) return `Invalid ${fieldName}: path must be within workspaces or data directory`;
  return null;
};

export const routes: RouteHandler[] = [
  {
    method: 'POST',
    pattern: /^\/api\/workspace\/snapshots$/,
    handler: async (req) => {
      const body = await req.json() as {
        name?: string; sessionId: string; agentId: string; workspacePath: string;
        memoryContext?: string[]; toolState?: Array<Record<string, unknown>>;
        tags?: string[]; includeContent?: boolean;
      };
      if (!body.sessionId) return err('sessionId required', 400);
      if (!body.workspacePath) return err('workspacePath required', 400);
      const pathErrW = await validateSandboxPath(body.workspacePath, 'workspacePath');
      if (pathErrW) return err(pathErrW, 400);
      const { captureWorkspaceSnapshot } = await import('../../../../../src/sandbox/workspace-snapshot.ts');
      return json(await captureWorkspaceSnapshot({
        name: body.name, sessionId: body.sessionId, agentId: body.agentId ?? '',
        workspacePath: body.workspacePath, memoryContext: body.memoryContext,
        toolState: body.toolState as any, tags: body.tags, includeContent: body.includeContent,
      }), 201);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/workspace\/snapshots$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const sessionId = url.searchParams.get('sessionId') ?? undefined;
      const limit = Number(url.searchParams.get('limit') ?? 50);
      const { listWorkspaceSnapshots } = await import('../../../../../src/sandbox/workspace-snapshot.ts');
      return json(await listWorkspaceSnapshots({ sessionId, limit }));
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/workspace\/snapshots\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/workspace\/snapshots\/([^/]+)$/);
      if (!m) return notFound();
      if (path.includes('/diff') || path.includes('/restore')) return notFound();
      const { getWorkspaceSnapshot } = await import('../../../../../src/sandbox/workspace-snapshot.ts');
      const snap = await getWorkspaceSnapshot(m[1]);
      if (!snap) return notFound('Workspace snapshot not found');
      return json(snap);
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/workspace\/snapshots\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/workspace\/snapshots\/([^/]+)$/);
      if (!m) return notFound();
      const { deleteWorkspaceSnapshot } = await import('../../../../../src/sandbox/workspace-snapshot.ts');
      const ok = await deleteWorkspaceSnapshot(m[1]);
      if (!ok) return notFound('Workspace snapshot not found');
      return json({ ok: true });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/workspace\/snapshots\/([^/]+)\/restore$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/workspace\/snapshots\/([^/]+)\/restore$/);
      if (!m) return notFound();
      const body = await req.json() as { targetWorkspacePath: string };
      if (!body.targetWorkspacePath) return err('targetWorkspacePath required', 400);
      const pathErrR = await validateSandboxPath(body.targetWorkspacePath, 'targetWorkspacePath');
      if (pathErrR) return err(pathErrR, 400);
      const { restoreWorkspaceSnapshot } = await import('../../../../../src/sandbox/workspace-snapshot.ts');
      return json(await restoreWorkspaceSnapshot(m[1], body.targetWorkspacePath));
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/workspace\/snapshots\/diff$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const id1 = url.searchParams.get('id1');
      const id2 = url.searchParams.get('id2');
      if (!id1 || !id2) return err('id1 and id2 required', 400);
      const { diffWorkspaceSnapshots } = await import('../../../../../src/sandbox/workspace-snapshot.ts');
      const result = await diffWorkspaceSnapshots(id1, id2);
      if (!result) return notFound('One or both snapshots not found');
      return json(result);
    },
  },
];
