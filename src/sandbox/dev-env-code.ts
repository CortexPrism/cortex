import { getCoreDb } from '../db/client.ts';
import { ensureDir } from '@std/fs';
import { join } from '@std/path';
import { detectDependencies } from './dependency-detect.ts';
import type { DevEnvManifest } from './snapshot-types.ts';
import type { SandboxRuntime } from './executor.ts';

const MANIFEST_FILE = 'cortex-devenv.json';

async function generateUniqueName(workspacePath: string, baseName: string): Promise<string> {
  try {
    const stat = await Deno.stat(workspacePath);
    const hashInput = workspacePath;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(hashInput));
    const suffix = Array.from(new Uint8Array(digest)).slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join('');
    return `${baseName}-${suffix}`;
  } catch {
    return `${baseName}-${Date.now().toString(36)}`;
  }
}

export async function generateDevEnvManifest(opts: {
  workspacePath: string;
  name?: string;
  runtime?: SandboxRuntime;
}): Promise<DevEnvManifest> {
  const deps = await detectDependencies(opts.workspacePath);

  const setupCommands: string[] = [];
  if (deps.language === 'javascript' && deps.managerHint !== 'none') {
    setupCommands.push(`${deps.managerHint} install`);
  } else if (deps.language === 'python') {
    setupCommands.push('pip install -r requirements.txt');
  }

  const requiredFiles: string[] = [];
  try {
    for await (const entry of Deno.readDir(opts.workspacePath)) {
      if (entry.isFile && !entry.name.startsWith('.')) requiredFiles.push(entry.name);
    }
  } catch { /* ignore */ }

  const uniqueName = opts.name ? opts.name : await generateUniqueName(opts.workspacePath, 'cortex-devenv');

  const manifest: DevEnvManifest = {
    name: uniqueName,
    version: '1.0.0',
    description: `Development environment generated from ${opts.workspacePath}`,
    sandbox: {
      runtime: opts.runtime ?? 'docker',
      timeoutMs: 30_000,
      memoryLimitMb: 256,
      cpuLimit: 0.5,
      networkMode: 'restricted',
    },
    environment: {},
    dependencies: { language: deps.language, manager: deps.managerHint, packages: deps.packages },
    workspace: {
      requiredFiles,
      ignorePatterns: ['node_modules', '.git', '__pycache__', '.DS_Store'],
      setupCommands,
    },
    meta: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'generated',
    },
  };

  return manifest;
}

export function validateDevEnvManifest(manifest: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!manifest || typeof manifest !== 'object') {
    errors.push('Manifest must be an object');
    return { valid: false, errors };
  }

  const m = manifest as Record<string, unknown>;

  if (!m.name || typeof m.name !== 'string') errors.push('name is required and must be a string');
  if (!m.version || typeof m.version !== 'string') errors.push('version is required and must be a string');

  if (!m.sandbox || typeof m.sandbox !== 'object') {
    errors.push('sandbox config is required');
  } else {
    const s = m.sandbox as Record<string, unknown>;
    if (!s.runtime) errors.push('sandbox.runtime is required');
    if (typeof s.memoryLimitMb !== 'number') errors.push('sandbox.memoryLimitMb must be a number');
    if (typeof s.cpuLimit !== 'number') errors.push('sandbox.cpuLimit must be a number');
    if (!['none', 'restricted', 'full'].includes(s.networkMode as string)) {
      errors.push('sandbox.networkMode must be none, restricted, or full');
    }
  }

  if (!m.dependencies || typeof m.dependencies !== 'object') {
    errors.push('dependencies section is required');
  }

  return { valid: errors.length === 0, errors };
}

export async function saveDevEnvManifest(
  workspacePath: string,
  manifest: DevEnvManifest,
): Promise<{ ok: boolean; path: string }> {
  await ensureDir(workspacePath);
  const filePath = join(workspacePath, MANIFEST_FILE);
  manifest.meta.updatedAt = new Date().toISOString();
  manifest.meta.source = 'manual';
  await Deno.writeTextFile(filePath, JSON.stringify(manifest, null, 2));

  const db = await getCoreDb();
  await db.run(
    `INSERT INTO dev_env_manifests (name, version, workspace_path, manifest_json, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET version=excluded.version, workspace_path=excluded.workspace_path, manifest_json=excluded.manifest_json, updated_at=excluded.updated_at`,
    [manifest.name, manifest.version, workspacePath, JSON.stringify(manifest), manifest.meta.updatedAt],
  );

  return { ok: true, path: filePath };
}

export async function loadDevEnvManifest(workspacePath: string): Promise<DevEnvManifest | null> {
  try {
    const content = await Deno.readTextFile(join(workspacePath, MANIFEST_FILE));
    return JSON.parse(content) as DevEnvManifest;
  } catch {
    return null;
  }
}

export async function listDevEnvManifests(): Promise<Array<{ name: string; version: string; workspacePath: string; updatedAt: string }>> {
  const db = await getCoreDb();
  return await db.all('SELECT name, version, workspace_path AS workspacePath, updated_at AS updatedAt FROM dev_env_manifests ORDER BY updated_at DESC');
}
