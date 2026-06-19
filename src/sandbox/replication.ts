import { getCoreDb } from '../db/client.ts';
import { ensureDir } from '@std/fs';
import { join } from '@std/path';
import { PATHS } from '../config/paths.ts';
import { captureGitState } from './git-capture.ts';
import { detectDependencies } from './dependency-detect.ts';
import type { EnvironmentSnapshot } from './snapshot-types.ts';
import type { SandboxRuntime } from './executor.ts';

const SNAPSHOTS_DIR = 'sandbox-snapshots';
const MAX_ENV_VALUE_LENGTH = 1024;
const SENSITIVE_KEY_PATTERN =
  /^(?:.*(?:API_KEY|TOKEN|SECRET|PASSWORD|AUTH|CREDENTIAL|PRIVATE_KEY|ACCESS_KEY).*)$/i;

function snapshotDir(): string {
  return join(PATHS.dataDir, SNAPSHOTS_DIR);
}

function snapshotPath(id: string): string {
  return join(snapshotDir(), `${id}.json`);
}

function generateId(): string {
  return `snap-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function safeShellValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`')
    .replace(/!/g, '\\!');
}

export function maskSensitiveEnv(env: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      masked[key] = value.length > 8 ? value.slice(0, 4) + '****' + value.slice(-4) : '****';
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

function validateEnvKey(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
}

function validateEnvValue(value: string): boolean {
  return value.length <= MAX_ENV_VALUE_LENGTH;
}

export async function captureEnvironmentSnapshot(opts: {
  name?: string;
  sessionId: string;
  agentId: string;
  workspacePath: string;
  runtime?: SandboxRuntime;
  env?: Record<string, string>;
  tags?: string[];
}): Promise<EnvironmentSnapshot> {
  await ensureDir(snapshotDir());

  const id = generateId();
  const deps = await detectDependencies(opts.workspacePath);
  const gitState = await captureGitState(opts.workspacePath);

  const cleanEnv: Record<string, string> = {};
  if (opts.env) {
    for (const [key, value] of Object.entries(opts.env)) {
      if (validateEnvKey(key) && validateEnvValue(value)) {
        cleanEnv[key] = value;
      }
    }
  }

  const snapshot: EnvironmentSnapshot = {
    id,
    name: opts.name ?? `Snapshot ${new Date().toISOString().slice(0, 19)}`,
    sessionId: opts.sessionId,
    agentId: opts.agentId,
    createdAt: new Date().toISOString(),
    runtime: opts.runtime ?? 'docker',
    env: cleanEnv,
    dependencies: deps,
    gitState,
    sandboxConfig: {
      runtime: opts.runtime ?? 'docker',
      timeoutMs: 30_000,
      memoryLimitMb: 256,
      cpuLimit: 0.5,
      networkMode: 'none',
    },
    workspacePath: opts.workspacePath,
    tags: opts.tags ?? [],
  };

  await Deno.writeTextFile(snapshotPath(id), JSON.stringify(snapshot, null, 2));

  const db = await getCoreDb();
  await db.run(
    `INSERT INTO sandbox_snapshots (id, name, session_id, agent_id, created_at, runtime, workspace_path, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name`,
    [
      id,
      snapshot.name,
      opts.sessionId,
      opts.agentId,
      snapshot.createdAt,
      snapshot.runtime,
      opts.workspacePath,
      JSON.stringify(opts.tags ?? []),
    ],
  );

  return snapshot;
}

export async function getEnvironmentSnapshot(id: string): Promise<EnvironmentSnapshot | null> {
  try {
    const content = await Deno.readTextFile(snapshotPath(id));
    return JSON.parse(content) as EnvironmentSnapshot;
  } catch {
    return null;
  }
}

export async function listEnvironmentSnapshots(opts: {
  sessionId?: string;
  limit?: number;
}): Promise<EnvironmentSnapshot[]> {
  await ensureDir(snapshotDir());
  const entries: EnvironmentSnapshot[] = [];

  const db = await getCoreDb();
  let rows: Array<Record<string, unknown>>;
  if (opts.sessionId) {
    rows = await db.all(
      'SELECT id FROM sandbox_snapshots WHERE session_id = ? ORDER BY created_at DESC LIMIT ?',
      [opts.sessionId, opts.limit ?? 50],
    );
  } else {
    rows = await db.all('SELECT id FROM sandbox_snapshots ORDER BY created_at DESC LIMIT ?', [
      opts.limit ?? 50,
    ]);
  }

  for (const row of rows) {
    const snap = await getEnvironmentSnapshot(row.id as string);
    if (snap) {
      snap.env = maskSensitiveEnv(snap.env);
      entries.push(snap);
    }
  }
  return entries;
}

export async function deleteEnvironmentSnapshot(id: string): Promise<boolean> {
  try {
    await Deno.remove(snapshotPath(id));
    const db = await getCoreDb();
    await db.run('DELETE FROM sandbox_snapshots WHERE id = ?', [id]);
    return true;
  } catch {
    return false;
  }
}

export async function compareSnapshots(
  id1: string,
  id2: string,
): Promise<{ added: string[]; removed: string[]; changed: string[] } | null> {
  const s1 = await getEnvironmentSnapshot(id1);
  const s2 = await getEnvironmentSnapshot(id2);
  if (!s1 || !s2) return null;

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  const allKeys = new Set([...Object.keys(s1.env), ...Object.keys(s2.env)]);
  for (const key of allKeys) {
    if (!(key in s1.env)) added.push(`env:${key}`);
    else if (!(key in s2.env)) removed.push(`env:${key}`);
    else if (s1.env[key] !== s2.env[key]) changed.push(`env:${key}`);
  }

  const allPkgs = new Set([
    ...Object.keys(s1.dependencies.packages),
    ...Object.keys(s2.dependencies.packages),
  ]);
  for (const pkg of allPkgs) {
    if (!(pkg in s1.dependencies.packages)) added.push(`dep:${pkg}`);
    else if (!(pkg in s2.dependencies.packages)) removed.push(`dep:${pkg}`);
    else if (s1.dependencies.packages[pkg] !== s2.dependencies.packages[pkg]) {
      changed.push(`dep:${pkg}`);
    }
  }

  return { added, removed, changed };
}

export async function replicateEnvironment(
  snapshotId: string,
  targetSessionId: string,
  targetWorkspacePath: string,
): Promise<{ ok: boolean; message: string }> {
  const snap = await getEnvironmentSnapshot(snapshotId);
  if (!snap) return { ok: false, message: 'Snapshot not found' };

  await ensureDir(targetWorkspacePath);

  const lines: string[] = [
    '# Environment Replication from snapshot: ' + snap.name,
    '# Created: ' + snap.createdAt,
    '# Runtime: ' + snap.runtime,
    '#',
    '# Source this file with: source .cortex-env-replication.sh',
    '',
  ];

  const safeEnvEntries = Object.entries(snap.env).filter(([key]) => validateEnvKey(key));
  if (safeEnvEntries.length > 0) {
    lines.push('# To apply all env vars, uncomment the export lines below:');
    for (const [key, value] of safeEnvEntries) {
      const safeValue = safeShellValue(value);
      lines.push(`# export ${key}="${safeValue}"`);
    }
  }

  lines.push('');
  lines.push(
    '# Dependencies (' + snap.dependencies.language + ', ' + snap.dependencies.managerHint + '):',
  );
  for (const [pkg, ver] of Object.entries(snap.dependencies.packages)) {
    lines.push('#   ' + pkg + ' @ ' + ver);
  }

  await Deno.writeTextFile(
    join(targetWorkspacePath, '.cortex-env-replication.sh'),
    lines.join('\n'),
  );

  return {
    ok: true,
    message: `Environment replicated from snapshot ${snap.name} to ${targetWorkspacePath}`,
  };
}
