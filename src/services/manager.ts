/**
 * Micro-service manager.
 * Manages long-running agent processes as micro-services with
 * health monitoring, auto-restart, and a registry stored in cortex.db.
 */
import { fromFileUrl } from '@std/path';
import { isWindows } from '../utils/platform.ts';
import { getCoreDb } from '../db/client.ts';
import { PATHS } from '../config/paths.ts';
import type { InValue } from 'npm:@libsql/client';

/** Service definition stored in the registry */
export interface ServiceDef {
  id: string;
  name: string;
  description?: string;
  /** Registered agent ID to use as the service's identity */
  agentId: string;
  /** Model override */
  model?: string;
  /** Provider override */
  provider?: string;
  /** System prompt override */
  systemPrompt?: string;
  /** Tool allow-list */
  tools?: string;
  /** HTTP port (0 = no HTTP) */
  port: number;
  /** Auto-start on service manager boot */
  autoStart: boolean;
  /** Max consecutive restarts before giving up (0 = unlimited) */
  maxRestarts: number;
  /** Health check interval in seconds (0 = no health checks) */
  healthCheckInterval: number;
  /** Environment variables (JSON string) */
  env?: string;
  status: 'stopped' | 'running' | 'failed';
  pid: number | null;
  lastStartedAt: string | null;
  lastHealthCheck: string | null;
  restartCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Runtime state of a service process (not persisted) */
interface ServiceRuntime {
  pid: number;
  process: Deno.ChildProcess;
  startedAt: number;
}

// In-memory runtime map (process handles are not serializable)
const runningServices = new Map<string, ServiceRuntime>();
let serviceManagerBooted = false;

// Health check intervals
const healthTimers = new Map<string, number>();

// ── Registry CRUD ──────────────────────────────────────────

function makeId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function registerService(
  def:
    & Omit<
      ServiceDef,
      | 'id'
      | 'status'
      | 'pid'
      | 'lastStartedAt'
      | 'lastHealthCheck'
      | 'restartCount'
      | 'createdAt'
      | 'updatedAt'
    >
    & { id?: string },
): Promise<string> {
  const db = await getCoreDb();
  const id = def.id || makeId(def.name);
  const now = new Date().toISOString();

  await db.run(
    `INSERT INTO services (id, name, description, agent_id, model, provider, system_prompt, tools, port, auto_start, max_restarts, health_check_interval, env, status, pid, last_started_at, last_health_check, restart_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'stopped', NULL, NULL, NULL, 0, ?, ?)`,
    [
      id,
      def.name,
      def.description || null,
      def.agentId,
      def.model || null,
      def.provider || null,
      def.systemPrompt || null,
      def.tools || null,
      def.port || 0,
      def.autoStart ? 1 : 0,
      def.maxRestarts ?? 3,
      def.healthCheckInterval ?? 30,
      def.env || null,
      now,
      now,
    ] as InValue[],
  );

  return id;
}

export async function listServices(): Promise<ServiceDef[]> {
  const db = await getCoreDb();
  const rows = await db.all(
    `SELECT * FROM services ORDER BY created_at DESC`,
  );
  return (rows as Record<string, unknown>[]).map(deserializeRow);
}

export async function getService(id: string): Promise<ServiceDef | null> {
  const db = await getCoreDb();
  const row = await db.get(
    `SELECT * FROM services WHERE id = ?`,
    [id],
  );
  return row ? deserializeRow(row as Record<string, unknown>) : null;
}

export async function updateService(id: string, patch: Partial<ServiceDef>): Promise<void> {
  const db = await getCoreDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  const fieldMap: Record<string, string> = {
    name: 'name',
    description: 'description',
    agentId: 'agent_id',
    model: 'model',
    provider: 'provider',
    systemPrompt: 'system_prompt',
    tools: 'tools',
    port: 'port',
    autoStart: 'auto_start',
    maxRestarts: 'max_restarts',
    healthCheckInterval: 'health_check_interval',
    env: 'env',
  };

  for (const [key, col] of Object.entries(fieldMap)) {
    if (key in patch) {
      fields.push(`${col} = ?`);
      values.push(patch[key as keyof typeof patch] ?? null);
    }
  }

  if (fields.length === 0) return;

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  await db.run(
    `UPDATE services SET ${fields.join(', ')} WHERE id = ?`,
    values as InValue[],
  );
}

export async function deleteService(id: string): Promise<void> {
  await stopService(id);
  const db = await getCoreDb();
  await db.run(`DELETE FROM services WHERE id = ?`, [id]);
}

function deserializeRow(row: Record<string, unknown>): ServiceDef {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string | undefined,
    agentId: row.agent_id as string,
    model: row.model as string | undefined,
    provider: row.provider as string | undefined,
    systemPrompt: row.system_prompt as string | undefined,
    tools: row.tools as string | undefined,
    port: (row.port as number) || 0,
    autoStart: (row.auto_start as number) === 1,
    maxRestarts: (row.max_restarts as number) ?? 3,
    healthCheckInterval: (row.health_check_interval as number) ?? 30,
    env: row.env as string | undefined,
    status: row.status as ServiceDef['status'],
    pid: row.pid as number | null,
    lastStartedAt: row.last_started_at as string | null,
    lastHealthCheck: row.last_health_check as string | null,
    restartCount: (row.restart_count as number) || 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ── Lifecycle ──────────────────────────────────────────────

export async function startService(id: string): Promise<void> {
  const def = await getService(id);
  if (!def) throw new Error(`Service "${id}" not found`);

  if (runningServices.has(id)) {
    // Already running
    return;
  }

  const db = await getCoreDb();

  // Build the command for the sub-agent entry that will run as a service
  const agentCfg = {
    agentId: def.agentId,
    model: def.model || undefined,
    provider: def.provider || undefined,
    systemPrompt: def.systemPrompt || undefined,
    tools: def.tools ? def.tools.split(',').map((s) => s.trim()) : undefined,
    timeout: 0, // no timeout for services
  };

  // For services, we run a persistent sub-agent that listens on a socket
  // For now, start a process that waits for tasks via a file or socket
  // Simplified: the service runs as a long-lived agent process

  const cmd = new Deno.Command(Deno.execPath(), {
    args: [
      'run',
      '--allow-all',
      fromFileUrl(new URL('../../src/processes/service-entry.ts', import.meta.url)),
      '--service-id',
      id,
      '--port',
      String(def.port || 0),
    ],
    stdin: 'null',
    stdout: 'piped',
    stderr: 'piped',
    env: def.env ? { ...JSON.parse(def.env) } : undefined,
  });

  const process = cmd.spawn();
  const pid = process.pid;

  // Track runtime
  runningServices.set(id, { pid, process, startedAt: Date.now() });

  // Update DB
  await db.run(
    `UPDATE services SET status = 'running', pid = ?, last_started_at = ?, restart_count = restart_count + 1, updated_at = ? WHERE id = ?`,
    [pid, new Date().toISOString(), new Date().toISOString(), id] as InValue[],
  );

  // Start health check loop
  if (def.healthCheckInterval > 0) {
    startHealthCheck(id, def.healthCheckInterval);
  }

  // Monitor process exit
  monitorService(id, process);
}

async function monitorService(id: string, process: Deno.ChildProcess): Promise<void> {
  const status = await process.status;
  const def = await getService(id);
  if (!def) return;

  runningServices.delete(id);
  stopHealthCheck(id);

  const db = await getCoreDb();
  const isExpectedStop = status.code === 0;

  if (isExpectedStop) {
    await db.run(
      `UPDATE services SET status = 'stopped', pid = NULL, updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), id] as InValue[],
    );
    return;
  }

  // Process crashed — attempt restart
  if (def.maxRestarts === 0 || (def.restartCount ?? 0) < def.maxRestarts) {
    await db.run(
      `UPDATE services SET status = 'restarting', pid = NULL, updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), id] as InValue[],
    );
    // Exponential backoff: 2^restart_count seconds
    const delay = Math.min(Math.pow(2, def.restartCount ?? 0) * 1000, 30000);
    await new Promise((r) => setTimeout(r, delay));
    startService(id).catch(() => {});
  } else {
    await db.run(
      `UPDATE services SET status = 'failed', pid = NULL, updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), id] as InValue[],
    );
  }
}

export async function stopService(id: string): Promise<void> {
  const runtime = runningServices.get(id);
  if (runtime) {
    try {
      runtime.process.kill(isWindows() ? undefined : 'SIGTERM');
    } catch { /* ignore */ }
    runningServices.delete(id);
    stopHealthCheck(id);
  }

  const db = await getCoreDb();
  await db.run(
    `UPDATE services SET status = 'stopped', pid = NULL, updated_at = ? WHERE id = ?`,
    [new Date().toISOString(), id] as InValue[],
  );
}

export async function stopAllServices(): Promise<void> {
  for (const id of runningServices.keys()) {
    await stopService(id);
  }
}

export function getServiceLogs(id: string): string {
  try {
    const logPath = `${PATHS.dataDir}/services/${id}/stderr.log`;
    const content = Deno.readTextFileSync(logPath);
    const lines = content.split('\n');
    return lines.slice(-200).join('\n');
  } catch {
    return '';
  }
}

// ── Health checks ──────────────────────────────────────────

function startHealthCheck(id: string, intervalSec: number): void {
  stopHealthCheck(id);
  const timer = setInterval(async () => {
    const runtime = runningServices.get(id);
    if (!runtime) {
      stopHealthCheck(id);
      return;
    }

    const db = await getCoreDb();
    await db.run(
      `UPDATE services SET last_health_check = ? WHERE id = ?`,
      [new Date().toISOString(), id] as InValue[],
    );
  }, intervalSec * 1000);

  healthTimers.set(id, timer as unknown as number);
}

function stopHealthCheck(id: string): void {
  const timer = healthTimers.get(id);
  if (timer) {
    clearInterval(timer);
    healthTimers.delete(id);
  }
}

// ── Auto-start registered services ─────────────────────────

export async function startAutoServices(): Promise<void> {
  serviceManagerBooted = true;
  const services = await listServices();
  for (const s of services) {
    if (s.autoStart && s.status === 'stopped') {
      startService(s.id).catch(() => {});
    }
  }
}

export function isServiceManagerActive(): boolean {
  return serviceManagerBooted;
}

export async function getRuntimeStatus(): Promise<
  Array<{ id: string; running: boolean; pid: number | null; uptime: number | null }>
> {
  const services = await listServices();
  return services.map((s) => {
    const runtime = runningServices.get(s.id);
    return {
      id: s.id,
      running: runtime !== undefined,
      pid: runtime?.pid ?? null,
      uptime: runtime ? Math.floor((Date.now() - runtime.startedAt) / 1000) : null,
    };
  });
}

// ── Cleanup on shutdown ────────────────────────────────────

// Deno.addSignalListener doesn't exist in all versions;
// the service manager should be stopped explicitly by the caller.
