import { logger } from '../../utils/logger.ts';

const _log = logger('orchestration:isolation');

let _captureWorkspaceSnapshot:
  | ((
    opts: Record<string, unknown>,
  ) => Promise<{ id: string; fileTree: Array<{ path: string; hash: string; content?: string }> }>)
  | null = null;
let _diffWorkspaceSnapshots:
  | ((
    id1: string,
    id2: string,
  ) => Promise<{ added: string[]; removed: string[]; modified: string[] } | null>)
  | null = null;

async function loadSandboxModule<T>(importPath: string): Promise<T | null> {
  try {
    return await import(importPath) as T;
  } catch {
    _log.debug(`Sandbox module not available: ${importPath}`);
    return null;
  }
}

export async function isIsolationAvailable(): Promise<boolean> {
  const mod = await loadSandboxModule<{
    getAvailableRuntime: () => Promise<{ type: string; available: boolean }>;
  }>(
    '../../../../packages/gate/src/sandbox/executor.ts',
  );
  if (!mod) return false;

  try {
    const runtime = await mod.getAvailableRuntime();
    return runtime.available;
  } catch {
    return false;
  }
}

export async function captureBaseSnapshot(
  workspaceDir: string,
  sessionId: string,
  agentId: string,
): Promise<{ ok: boolean; baseSnapshotId?: string; error?: string }> {
  if (!_captureWorkspaceSnapshot) {
    const mod = await loadSandboxModule<{
      captureWorkspaceSnapshot: (
        opts: Record<string, unknown>,
      ) => Promise<
        { id: string; fileTree: Array<{ path: string; hash: string; content?: string }> }
      >;
    }>(
      '../../../../packages/gate/src/sandbox/workspace-snapshot.ts',
    );
    if (!mod) return { ok: false, error: 'Workspace snapshot module not available.' };
    _captureWorkspaceSnapshot = mod.captureWorkspaceSnapshot;
  }

  try {
    const snapshot = await _captureWorkspaceSnapshot({
      sessionId,
      agentId,
      workspacePath: workspaceDir,
      includeContent: true,
      name: `orchestration-base-${sessionId}`,
    });
    return { ok: true, baseSnapshotId: snapshot.id };
  } catch (e) {
    return { ok: false, error: `Failed to capture base snapshot: ${(e as Error).message}` };
  }
}

export async function captureChangeBundle(
  workspaceDir: string,
  baseSnapshotId: string,
  sessionId: string,
  agentId: string,
): Promise<{
  ok: boolean;
  changeBundle?: {
    files: Array<{ path: string; content?: string; hash?: string }>;
    added_files: string[];
    removed_files: string[];
    modified_files: string[];
  };
  finalSnapshotId?: string;
  error?: string;
}> {
  if (!_captureWorkspaceSnapshot) {
    const mod = await loadSandboxModule<{
      captureWorkspaceSnapshot: (
        opts: Record<string, unknown>,
      ) => Promise<
        { id: string; fileTree: Array<{ path: string; hash: string; content?: string }> }
      >;
    }>(
      '../../../../packages/gate/src/sandbox/workspace-snapshot.ts',
    );
    if (!mod) return { ok: false, error: 'Workspace snapshot module not available.' };
    _captureWorkspaceSnapshot = mod.captureWorkspaceSnapshot;
  }
  if (!_diffWorkspaceSnapshots) {
    const mod = await loadSandboxModule<{
      diffWorkspaceSnapshots: (
        id1: string,
        id2: string,
      ) => Promise<{ added: string[]; removed: string[]; modified: string[] } | null>;
    }>(
      '../../../../packages/gate/src/sandbox/workspace-snapshot.ts',
    );
    if (!mod) return { ok: false, error: 'Workspace snapshot module not available.' };
    _diffWorkspaceSnapshots = mod.diffWorkspaceSnapshots;
  }

  try {
    const finalSnapshot = await _captureWorkspaceSnapshot({
      sessionId,
      agentId,
      workspacePath: workspaceDir,
      includeContent: true,
      name: `orchestration-final-${sessionId}`,
    });

    const diff = await _diffWorkspaceSnapshots(baseSnapshotId, finalSnapshot.id);
    if (!diff) {
      return { ok: false, error: 'Failed to diff workspace snapshots.' };
    }

    const files: Array<{ path: string; content?: string; hash?: string }> = [];

    for (const path of diff.added) {
      const entry = finalSnapshot.fileTree.find((f) => f.path === path);
      files.push({ path, content: entry?.content, hash: entry?.hash });
    }
    for (const path of diff.modified) {
      const entry = finalSnapshot.fileTree.find((f) => f.path === path);
      files.push({ path, content: entry?.content, hash: entry?.hash });
    }
    for (const path of diff.removed) {
      files.push({ path, content: undefined });
    }

    return {
      ok: true,
      changeBundle: {
        files,
        added_files: diff.added,
        removed_files: diff.removed,
        modified_files: diff.modified,
      },
      finalSnapshotId: finalSnapshot.id,
    };
  } catch (e) {
    return { ok: false, error: `Failed to collect change bundle: ${(e as Error).message}` };
  }
}
