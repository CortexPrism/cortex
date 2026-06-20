import { ensureDir } from '@std/fs';
import { join, relative } from '@std/path';
import { getCoreDb } from '../db/client.ts';
import { PATHS } from '../config/paths.ts';
import { captureGitState } from './git-capture.ts';
import {
  debugLog,
  errorLog,
  infoLog,
  validateSandboxPath,
  warnLog,
  workspaceLog,
} from './logger.ts';
import type { FileTreeEntry, ToolStateEntry, WorkspaceSnapshot } from './snapshot-types.ts';

const SNAPSHOTS_DIR = 'workspace-snapshots';
const MAX_HASH_SIZE = 10 * 1024 * 1024;
const MAX_CONTENT_SIZE = 5 * 1024 * 1024;

function encodeBase64(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data));
}

function decodeBase64(data: string): Uint8Array {
  const binary = atob(data);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

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
  includeContent: boolean,
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
        const tooLarge = stat.size > MAX_HASH_SIZE;
        const hash = tooLarge ? `skipped:too-large:${stat.size}` : await hashFile(fullPath);
        const entryData: FileTreeEntry = {
          path: relPath,
          size: stat.size,
          modifiedAt: stat.mtime?.toISOString() ?? new Date().toISOString(),
          hash,
        };
        if (includeContent && !tooLarge && stat.size <= MAX_CONTENT_SIZE) {
          try {
            const raw = await Deno.readFile(fullPath);
            entryData.content = encodeBase64(raw);
          } catch {
            // file became unreadable between stat and read
          }
        }
        entries.push(entryData);
      } else if (entry.isDirectory) {
        const children = await scanFileTree(fullPath, baseDir, ignorePatterns, includeContent);
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
  includeContent?: boolean;
}): Promise<WorkspaceSnapshot> {
  debugLog(workspaceLog, `captureWorkspaceSnapshot: validating path`, {
    workspacePath: opts.workspacePath,
  });
  const pathCheck = validateSandboxPath(opts.workspacePath, 'workspacePath');
  if (!pathCheck.valid) {
    warnLog(workspaceLog, `path rejected by sandbox validation: ${pathCheck.error}`, pathCheck);
  }

  await ensureDir(snapshotDir());

  const id = generateId();
  const includeContent = opts.includeContent === true;

  debugLog(workspaceLog, `capturing workspace snapshot: ${id}`, {
    workspacePath: opts.workspacePath,
    sessionId: opts.sessionId,
    includeContent,
  });

  const fileTree = await scanFileTree(opts.workspacePath, opts.workspacePath, [
    '.git',
    'node_modules',
    '__pycache__',
    '.DS_Store',
  ], includeContent);

  debugLog(workspaceLog, `scanned ${fileTree.length} files`, {
    withContent: fileTree.filter((f) => f.content !== undefined).length,
    largeSkipped: fileTree.filter((f) => f.hash.startsWith('skipped:')).length,
  });

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
  debugLog(workspaceLog, `deleting workspace snapshot: ${id}`);
  try {
    await Deno.remove(snapshotPath(id));
    const db = await getCoreDb();
    await db.run('DELETE FROM workspace_snapshots WHERE id = ?', [id]);
    infoLog(workspaceLog, `deleted workspace snapshot: ${id}`);
    return true;
  } catch (e) {
    warnLog(workspaceLog, `failed to delete workspace snapshot: ${id}`, {
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

export async function diffWorkspaceSnapshots(
  id1: string,
  id2: string,
): Promise<{ added: string[]; removed: string[]; modified: string[] } | null> {
  const s1 = await getWorkspaceSnapshot(id1);
  const s2 = await getWorkspaceSnapshot(id2);
  if (!s1 || !s2) {
    warnLog(workspaceLog, `diff failed: snapshot(s) not found`, {
      id1: !s1 ? 'missing' : 'found',
      id2: !s2 ? 'missing' : 'found',
    });
    return null;
  }

  debugLog(workspaceLog, `diffing snapshots: ${id1} vs ${id2}`);

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
  debugLog(workspaceLog, `restoreWorkspaceSnapshot: validating path`, { targetWorkspacePath });
  const pathCheck = validateSandboxPath(targetWorkspacePath, 'targetWorkspacePath');
  if (!pathCheck.valid) {
    warnLog(workspaceLog, `path rejected by sandbox validation: ${pathCheck.error}`, pathCheck);
  }

  debugLog(workspaceLog, `restoring workspace snapshot: ${snapshotId}`, {
    targetWorkspacePath,
  });

  const snap = await getWorkspaceSnapshot(snapshotId);
  if (!snap) {
    warnLog(workspaceLog, `snapshot not found: ${snapshotId}`);
    return { ok: false, message: 'Snapshot not found' };
  }

  await ensureDir(targetWorkspacePath);

  const filesWithContent = snap.fileTree.filter((f) => f.content !== undefined);
  const totalWithContent = filesWithContent.length;
  let restoredCount = 0;
  let skippedCount = 0;

  for (const entry of filesWithContent) {
    const targetPath = join(targetWorkspacePath, entry.path);
    try {
      await ensureDir(join(targetPath, '..'));
      const data = decodeBase64(entry.content!);
      await Deno.writeFile(targetPath, data);
      restoredCount++;
    } catch (e) {
      skippedCount++;
      warnLog(workspaceLog, `failed to restore file: ${entry.path}`, {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  infoLog(workspaceLog, `workspace restore complete`, {
    restoredCount,
    skippedCount,
    withoutContent: snap.fileTree.length - totalWithContent,
  });

  const manifestPath = join(targetWorkspacePath, '.cortex-ws-restore.json');
  const manifestEntries = snap.fileTree.map(({ content, ...rest }) => rest);
  await Deno.writeTextFile(
    manifestPath,
    JSON.stringify(
      {
        snapshotId: snap.id,
        snapshotName: snap.name,
        createdAt: snap.createdAt,
        restoredAt: new Date().toISOString(),
        fileTree: manifestEntries,
      },
      null,
      2,
    ),
  );

  const withoutContent = snap.fileTree.length - totalWithContent;
  const largeCount = snap.fileTree.filter((f) => f.hash.startsWith('skipped:')).length;

  const parts: string[] = [];
  if (restoredCount > 0) parts.push(`${restoredCount} file(s) restored`);
  if (skippedCount > 0) parts.push(`${skippedCount} file(s) failed to write`);
  if (withoutContent > 0) {
    parts.push(
      `${withoutContent} file(s) lack embedded content (capture with includeContent: true to embed)`,
    );
  }
  if (largeCount > 0) parts.push(`${largeCount} large file(s) skipped (exceed size limit)`);

  return {
    ok: true,
    message: `Workspace snapshot "${snap.name}" restore to ${targetWorkspacePath}: ${
      parts.join(', ')
    }.`,
  };
}
