import { err, json, notFound, type RouteHandler } from './_helpers.ts';
import type { SandboxRuntime } from '../../../../../src/sandbox/executor.ts';
import type { loadConfig } from '../../../../../src/config/config.ts';

const validateSandboxPath = async (
  inputPath: string,
  fieldName: string,
): Promise<string | null> => {
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
    method: 'GET',
    pattern: /^\/api\/sandbox\/backends$/,
    handler: async () => {
      const { isDockerAvailable, isGVisorAvailable } = await import(
        '../../../../../src/sandbox/executor.ts'
      );
      const dockerOk = await isDockerAvailable();
      const gvisorOk = await isGVisorAvailable();
      return json({
        backends: [
          {
            kind: 'docker',
            label: 'Docker',
            available: dockerOk,
            description: 'Local Docker container',
          },
          {
            kind: 'subprocess',
            label: 'Subprocess',
            available: true,
            description: 'Native subprocess',
          },
          {
            kind: 'gvisor',
            label: 'gVisor',
            available: gvisorOk,
            description: 'gVisor sandbox (requires installation)',
          },
          {
            kind: 'e2b',
            label: 'E2B',
            available: !!Deno.env.get('E2B_API_KEY'),
            description: 'E2B cloud sandbox',
          },
          {
            kind: 'daytona',
            label: 'Daytona',
            available: !!Deno.env.get('DAYTONA_API_KEY'),
            description: 'Daytona dev environments',
          },
        ],
        default: dockerOk ? 'docker' : 'subprocess',
      });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/sandbox\/debug$/,
    handler: async () => {
      const { isSandboxDebug } = await import('../../../../../src/sandbox/logger.ts');
      return json({ enabled: isSandboxDebug() });
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/sandbox\/debug$/,
    handler: async (req) => {
      const body = await req.json() as { enabled?: boolean };
      const { setSandboxDebug, toggleSandboxDebug, isSandboxDebug } = await import(
        '../../../../../src/sandbox/logger.ts'
      );
      if (body.enabled !== undefined) setSandboxDebug(body.enabled);
      else toggleSandboxDebug();
      return json({ enabled: isSandboxDebug() });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/sandbox\/snapshots$/,
    handler: async (req) => {
      const body = await req.json() as {
        name?: string;
        sessionId: string;
        agentId: string;
        workspacePath: string;
        runtime?: string;
        env?: Record<string, string>;
        tags?: string[];
      };
      if (!body.sessionId) return err('sessionId required', 400);
      if (!body.workspacePath) return err('workspacePath required', 400);
      const pathErr = await validateSandboxPath(body.workspacePath, 'workspacePath');
      if (pathErr) return err(pathErr, 400);
      const { captureEnvironmentSnapshot } = await import(
        '../../../../../src/sandbox/replication.ts'
      );
      return json(
        await captureEnvironmentSnapshot({
          name: body.name,
          sessionId: body.sessionId,
          agentId: body.agentId ?? '',
          workspacePath: body.workspacePath,
          runtime: body.runtime as SandboxRuntime,
          env: body.env,
          tags: body.tags,
        }),
        201,
      );
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/sandbox\/snapshots$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const sessionId = url.searchParams.get('sessionId') ?? undefined;
      const limit = Number(url.searchParams.get('limit') ?? 50);
      const { listEnvironmentSnapshots } = await import(
        '../../../../../src/sandbox/replication.ts'
      );
      return json(await listEnvironmentSnapshots({ sessionId, limit }));
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/sandbox\/snapshots\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/sandbox\/snapshots\/([^/]+)$/);
      if (!m) return notFound();
      if (path.includes('/compare') || path.includes('/replicate')) return notFound();
      const { getEnvironmentSnapshot, maskSensitiveEnv } = await import(
        '../../../../../src/sandbox/replication.ts'
      );
      const snap = await getEnvironmentSnapshot(m[1]);
      if (!snap) return notFound('Snapshot not found');
      snap.env = maskSensitiveEnv(snap.env);
      return json(snap);
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/sandbox\/snapshots\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/sandbox\/snapshots\/([^/]+)$/);
      if (!m) return notFound();
      const { deleteEnvironmentSnapshot } = await import(
        '../../../../../src/sandbox/replication.ts'
      );
      const ok = await deleteEnvironmentSnapshot(m[1]);
      if (!ok) return notFound('Snapshot not found');
      return json({ ok: true });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/sandbox\/snapshots\/([^/]+)\/replicate$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/sandbox\/snapshots\/([^/]+)\/replicate$/);
      if (!m) return notFound();
      const body = await req.json() as { targetSessionId: string; targetWorkspacePath: string };
      if (!body.targetSessionId) return err('targetSessionId required', 400);
      if (!body.targetWorkspacePath) return err('targetWorkspacePath required', 400);
      const pathErr = await validateSandboxPath(body.targetWorkspacePath, 'targetWorkspacePath');
      if (pathErr) return err(pathErr, 400);
      const { replicateEnvironment } = await import('../../../../../src/sandbox/replication.ts');
      return json(await replicateEnvironment(m[1], body.targetSessionId, body.targetWorkspacePath));
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/sandbox\/snapshots\/compare$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const id1 = url.searchParams.get('id1');
      const id2 = url.searchParams.get('id2');
      if (!id1 || !id2) return err('id1 and id2 required', 400);
      const { compareSnapshots } = await import('../../../../../src/sandbox/replication.ts');
      const result = await compareSnapshots(id1, id2);
      if (!result) return notFound('One or both snapshots not found');
      return json(result);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/sandbox\/dev-env\/generate$/,
    handler: async (req) => {
      const body = await req.json() as { workspacePath: string; name?: string; runtime?: string };
      if (!body.workspacePath) return err('workspacePath required', 400);
      const pathErrD = await validateSandboxPath(body.workspacePath, 'workspacePath');
      if (pathErrD) return err(pathErrD, 400);
      const { generateDevEnvManifest } = await import('../../../../../src/sandbox/dev-env-code.ts');
      return json(
        await generateDevEnvManifest({
          workspacePath: body.workspacePath,
          name: body.name,
          runtime: body.runtime as SandboxRuntime,
        }),
        201,
      );
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/sandbox\/dev-env\/manifest$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const wp = url.searchParams.get('workspacePath');
      if (!wp) return err('workspacePath required', 400);
      const pathErrM = await validateSandboxPath(wp, 'workspacePath');
      if (pathErrM) return err(pathErrM, 400);
      const { loadDevEnvManifest } = await import('../../../../../src/sandbox/dev-env-code.ts');
      const manifest = await loadDevEnvManifest(wp);
      if (!manifest) return notFound('No manifest found');
      return json(manifest);
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/sandbox\/dev-env\/manifest$/,
    handler: async (req) => {
      const body = await req.json() as { workspacePath: string; manifest: Record<string, unknown> };
      if (!body.workspacePath) return err('workspacePath required', 400);
      const pathErrP = await validateSandboxPath(body.workspacePath, 'workspacePath');
      if (pathErrP) return err(pathErrP, 400);
      if (!body.manifest) return err('manifest required', 400);
      const { saveDevEnvManifest, validateDevEnvManifest } = await import(
        '../../../../../src/sandbox/dev-env-code.ts'
      );
      const validation = validateDevEnvManifest(body.manifest);
      if (!validation.valid) return err(`Invalid manifest: ${validation.errors.join(', ')}`, 400);
      return json(await saveDevEnvManifest(body.workspacePath, body.manifest as any));
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/sandbox\/dev-env\/list$/,
    handler: async () => {
      const { listDevEnvManifests } = await import('../../../../../src/sandbox/dev-env-code.ts');
      return json(await listDevEnvManifests());
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/sandbox\/bug-repro$/,
    handler: async (req) => {
      const body = await req.json() as {
        issueTitle: string;
        issueDescription?: string;
        language: string;
        code: string;
        testCode?: string;
        runtime?: string;
        sessionId?: string;
        tags?: string[];
      };
      if (!body.issueTitle) return err('issueTitle required', 400);
      if (!body.language) return err('language required', 400);
      if (!body.code) return err('code required', 400);
      const { createBugRepro } = await import('../../../../../src/sandbox/bug-repro.ts');
      return json(
        await createBugRepro({
          issueTitle: body.issueTitle,
          issueDescription: body.issueDescription ?? '',
          language: body.language,
          code: body.code,
          testCode: body.testCode,
          runtime: body.runtime as SandboxRuntime,
          sessionId: body.sessionId,
          tags: body.tags,
        }),
        201,
      );
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/sandbox\/bug-repro$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const status = url.searchParams.get('status') ?? undefined;
      const sessionId = url.searchParams.get('sessionId') ?? undefined;
      const limit = Number(url.searchParams.get('limit') ?? 50);
      const { listBugRepros } = await import('../../../../../src/sandbox/bug-repro.ts');
      return json(await listBugRepros({ limit, status, sessionId }));
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/sandbox\/bug-repro\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/sandbox\/bug-repro\/([^/]+)$/);
      if (!m) return notFound();
      const { getBugRepro } = await import('../../../../../src/sandbox/bug-repro.ts');
      const run = await getBugRepro(m[1]);
      if (!run) return notFound('Bug repro not found');
      return json(run);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/sandbox\/bug-repro\/([^/]+)\/run$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/sandbox\/bug-repro\/([^/]+)\/run$/);
      if (!m) return notFound();
      const { executeBugRepro } = await import('../../../../../src/sandbox/bug-repro.ts');
      const run = await executeBugRepro(m[1]);
      if (!run) return notFound('Bug repro not found');
      return json(run);
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/sandbox\/bug-repro\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/sandbox\/bug-repro\/([^/]+)$/);
      if (!m) return notFound();
      const { deleteBugRepro } = await import('../../../../../src/sandbox/bug-repro.ts');
      const ok = await deleteBugRepro(m[1]);
      if (!ok) return notFound('Bug repro not found');
      return json({ ok: true });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/sandbox\/config$/,
    handler: async () => {
      const { getAvailableRuntime, isDockerAvailable, isGVisorAvailable } = await import(
        '../../../../../src/sandbox/executor.ts'
      );
      const runtime = await getAvailableRuntime();
      const dockerOk = await isDockerAvailable();
      const gvisorOk = await isGVisorAvailable();
      return json({
        runtime,
        dockerAvailable: dockerOk,
        gvisorAvailable: gvisorOk,
        timeoutMs: 30_000,
        memoryLimitMb: 256,
        cpuLimit: 0.5,
        supportedLanguages: ['python', 'javascript', 'typescript', 'bash', 'ruby', 'go', 'rust'],
      });
    },
  },
];
