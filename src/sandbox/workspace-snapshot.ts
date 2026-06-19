import { ensureDir } from '@std/fs';
import { join, relative } from '@std/path';
import { getCoreDb } from '../db/client.ts';
import { PATHS } from '../config/paths.ts';
import { captureGitState } from './git-capture.ts';
import type { FileTreeEntry, ToolStateEntry, WorkspaceSnapshot } from './snapshot-types.ts';

const SNAPSHOTS_DIR = 'workspace-snapshots';
const MAX_HASH_SIZE = 10 * 1024 * 1024;

function snapshotDir(): string {
  return join(PATHS.dataDir, SNAPSHOTS_DIR);
}

function snapshotPath(id: string): string {
  return join(snapshotDir(), `${id}.json`);
}

function generateId(): string {
  return `wsnap-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

async function hashFile(filePath: string): Promise<string> {
  try {
    const content = await Deno.readFile(filePath);
    const digest = await crypto.subtle.digest('SHA-256', content);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return 'error';
  }
}

async function scanFileTree(
  dir: string,
  baseDir: string,
  ignorePatterns: string[],
): Promise<FileTreeEntry[]> {
  const entries: FileTreeEntry[] = [];
  try {
    for await (const entry of Deno.readDir(dir)) {
      const fullPath = join(dir, entry.name);
      const relPath = relative(baseDir, fullPath);

      if (ignorePatterns.some((p) => relPath.includes(p) || relPath.startsWith(p))) continue;
      if (entry.name.startsWith('.git')) continue;
      if (entry.name === '.cortex-env-replication.sh') continue;
      if (entry.name === '.cortex-ws-restore.json') continue;
      if (entry.name === 'node_modules' && entry.isDirectory) continue;

      if (entry.isFile) {
        const stat = await Deno.stat(fullPath);
        const hash = stat.size > MAX_HASH_SIZE
          ? `skipped:too-large:${stat.size}`
          : await hashFile(fullPath);
        entries.push({
          path: relPath,
          size: stat.size,
          modifiedAt: stat.mtime?.toISOString() ?? new Date().toISOString(),
          hash,
        });
      } else if (entry.isDirectory) {
        const children = await scanFileTree(fullPath, baseDir, ignorePatterns);
        entries.push(...children);
      }
    }
  } catch {
    // directory may not exist
  }
  return entries;
}

export async function captureWorkspaceSnapshot(opts: {
  name?: string;
  sessionId: string;
  agentId: string;
  workspacePath: string;
  memoryContext?: string[];
  toolState?: ToolStateEntry[];
  tags?: string[];
}): Promise<WorkspaceSnapshot> {
  await ensureDir(snapshotDir());

  const id = generateId();

  const fileTree = await scanFileTree(opts.workspacePath, opts.workspacePath, [
    '.git',
    'node_modules',
    '__pycache__',
    '.DS_Store',
  ]);

  const gitState = await captureGitState(opts.workspacePath);

  const snapshot: WorkspaceSnapshot = {
    id,
    name: opts.name ?? `WS Snapshot ${new Date().toISOString().slice(0, 19)}`,
    sessionId: opts.sessionId,
    agentId: opts.agentId,
    createdAt: new Date().toISOString(),
    fileTree,
    gitState,
    memoryContext: opts.memoryContext ?? [],
    toolState: opts.toolState ?? [],
    tags: opts.tags ?? [],
  };

  await Deno.writeTextFile(snapshotPath(id), JSON.stringify(snapshot, null, 2));

  const db = await getCoreDb();
  await db.run(
    `INSERT INTO workspace_snapshots (id, name, session_id, agent_id, created_at, file_count, git_branch, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name`,
    [
      id,
      snapshot.name,
      opts.sessionId,
      opts.agentId,
      snapshot.createdAt,
      fileTree.length,
      gitState.branch,
      JSON.stringify(opts.tags ?? []),
    ],
  );

  return snapshot;
}

export async function getWorkspaceSnapshot(id: string): Promise<WorkspaceSnapshot | null> {
  try {
    const content = await Deno.readTextFile(snapshotPath(id));
    return JSON.parse(content) as WorkspaceSnapshot;
  } catch {
    return null;
  }
}

export async function listWorkspaceSnapshots(opts: {
  sessionId?: string;
  limit?: number;
}): Promise<WorkspaceSnapshot[]> {
  await ensureDir(snapshotDir());
  const snapshots: WorkspaceSnapshot[] = [];

  const db = await getCoreDb();
  let rows: Array<Record<string, unknown>>;
  if (opts.sessionId) {
    rows = await db.all(
      'SELECT id FROM workspace_snapshots WHERE session_id = ? ORDER BY created_at DESC LIMIT ?',
      [opts.sessionId, opts.limit ?? 50],
    );
  } else {
    rows = await db.all('SELECT id FROM workspace_snapshots ORDER BY created_at DESC LIMIT ?', [
      opts.limit ?? 50,
    ]);
  }

  for (const row of rows) {
    const snap = await getWorkspaceSnapshot(row.id as string);
    if (snap) snapshots.push(snap);
  }
  return snapshots;
}

export async function deleteWorkspaceSnapshot(id: string): Promise<boolean> {
  try {
    await Deno.remove(snapshotPath(id));
    const db = await getCoreDb();
    await db.run('DELETE FROM workspace_snapshots WHERE id = ?', [id]);
    return true;
  } catch {
    return false;
  }
}

export async function diffWorkspaceSnapshots(
  id1: string,
  id2: string,
): Promise<{ added: string[]; removed: string[]; modified: string[] } | null> {
  const s1 = await getWorkspaceSnapshot(id1);
  const s2 = await getWorkspaceSnapshot(id2);
  if (!s1 || !s2) return null;

  const files1 = new Map(s1.fileTree.map((f) => [f.path, f]));
  const files2 = new Map(s2.fileTree.map((f) => [f.path, f]));

  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];

  for (const [path] of files2) {
    if (!files1.has(path)) added.push(path);
  }
  for (const [path] of files1) {
    if (!files2.has(path)) removed.push(path);
    else if (files1.get(path)!.hash !== files2.get(path)!.hash) modified.push(path);
  }

  return { added, removed, modified };
}

export async function restoreWorkspaceSnapshot(
  snapshotId: string,
  targetWorkspacePath: string,
): Promise<{ ok: boolean; message: string }> {
  const snap = await getWorkspaceSnapshot(snapshotId);
  if (!snap) return { ok: false, message: 'Snapshot not found' };

  await ensureDir(targetWorkspacePath);

  const manifestPath = join(targetWorkspacePath, '.cortex-ws-restore.json');
  await Deno.writeTextFile(
    manifestPath,
    JSON.stringify(
      {
        snapshotId: snap.id,
        snapshotName: snap.name,
        createdAt: snap.createdAt,
        fileTree: snap.fileTree,
      },
      null,
      2,
    ),
  );

  const largeCount = snap.fileTree.filter((f) => f.hash.startsWith('skipped:')).length;
  const note = largeCount > 0 ? ` ${largeCount} large file(s) skipped (hashes not stored).` : '';

  return {
    ok: true,
    message:
      `Workspace snapshot ${snap.name} metadata written to ${targetWorkspacePath}/.cortex-ws-restore.json — ${snap.fileTree.length} file(s) indexed. Full file restoration requires snapshot file content storage, not yet implemented.${note}`,
  };
}
