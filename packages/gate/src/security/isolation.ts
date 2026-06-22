/**
 * Session Isolation Boundary — #139
 *
 * Enforces data isolation between different Cortex sessions. A session
 * working on Project A cannot access files, environment variables, or
 * memory from Project B unless explicitly authorized.
 */
import { logEvent } from '../../../../src/db/lens.ts';

export type IsolationMode = 'strict' | 'permissive' | 'shared';

export interface SessionIsolationConfig {
  sessionId: string;
  projectId: string;
  workspaceRoot: string;
  mode: IsolationMode;
  allowedPaths: string[];
  allowedEnvVars: string[];
  sharedSessions?: string[];
  createdAt: string;
}

export interface IsolationViolation {
  sessionId: string;
  resource: string;
  resourceType: 'file' | 'env' | 'memory' | 'network';
  attemptedAccess: string;
  timestamp: string;
}

const sessionConfigs = new Map<string, SessionIsolationConfig>();
const violations: IsolationViolation[] = [];
const MAX_VIOLATIONS = 1000;

export function registerSession(
  config: SessionIsolationConfig,
): void {
  sessionConfigs.set(config.sessionId, {
    ...config,
    allowedPaths: config.allowedPaths.map(normalizePath),
    createdAt: new Date().toISOString(),
  });
}

export function unregisterSession(sessionId: string): void {
  sessionConfigs.delete(sessionId);
}

export function getSessionConfig(sessionId: string): SessionIsolationConfig | undefined {
  return sessionConfigs.get(sessionId);
}

export function isPathAllowed(sessionId: string, path: string): boolean {
  const config = sessionConfigs.get(sessionId);
  if (!config) return true;

  const normalized = normalizePath(path);

  if (config.mode === 'shared') return true;

  if (normalized.startsWith(config.workspaceRoot)) return true;

  if (config.allowedPaths.some((allowed) => normalized.startsWith(allowed))) {
    return true;
  }

  recordViolation(sessionId, path, 'file');
  return false;
}

export function isEnvVarAllowed(sessionId: string, envVar: string): boolean {
  const config = sessionConfigs.get(sessionId);
  if (!config) return true;

  if (config.mode === 'shared') return true;

  const safeVars = new Set([
    'PATH',
    'HOME',
    'USER',
    'SHELL',
    'LANG',
    'TERM',
    'TZ',
    'NODE_ENV',
    'DENO_DIR',
    'CORTEX_VAULT_KEY',
    ...config.allowedEnvVars,
  ]);

  if (safeVars.has(envVar)) return true;

  recordViolation(sessionId, envVar, 'env');
  return false;
}

export function isMemoryAccessAllowed(
  sourceSessionId: string,
  targetSessionId: string,
): boolean {
  const sourceConfig = sessionConfigs.get(sourceSessionId);
  if (!sourceConfig) return true;

  if (sourceConfig.mode === 'shared') return true;

  if (sourceSessionId === targetSessionId) return true;

  if (sourceConfig.sharedSessions?.includes(targetSessionId)) return true;

  recordViolation(sourceSessionId, `memory:${targetSessionId}`, 'memory');
  return false;
}

export function canAccessNetwork(sessionId: string, domain: string): boolean {
  const config = sessionConfigs.get(sessionId);
  if (!config) return true;

  if (config.mode === 'permissive' || config.mode === 'shared') return true;

  return false;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

function recordViolation(
  sessionId: string,
  resource: string,
  resourceType: 'file' | 'env' | 'memory' | 'network',
): void {
  const violation: IsolationViolation = {
    sessionId,
    resource,
    resourceType,
    attemptedAccess: resource,
    timestamp: new Date().toISOString(),
  };

  violations.push(violation);
  if (violations.length > MAX_VIOLATIONS) violations.shift();

  logEvent({
    event_type: 'isolation_violation',
    session_id: sessionId,
    actor: 'session-isolation',
    action: `violation:${resourceType}`,
    summary: `Isolation violation: ${resourceType} access denied for session ${sessionId}`,
    started_at: violation.timestamp,
    payload: { resourceType, resource: resource.slice(0, 200) },
  }).catch(() => {});
}

export function getRecentViolations(
  sessionId?: string,
  limit = 50,
): IsolationViolation[] {
  const filtered = sessionId ? violations.filter((v) => v.sessionId === sessionId) : violations;
  return filtered.slice(-limit).reverse();
}

export function createProjectIsolation(
  sessionId: string,
  projectId: string,
  workspaceRoot: string,
  mode: IsolationMode = 'strict',
): SessionIsolationConfig {
  const config: SessionIsolationConfig = {
    sessionId,
    projectId,
    workspaceRoot: normalizePath(workspaceRoot),
    mode,
    allowedPaths: [],
    allowedEnvVars: [],
    createdAt: new Date().toISOString(),
  };

  registerSession(config);
  return config;
}

export function allowPathForSession(sessionId: string, path: string): void {
  const config = sessionConfigs.get(sessionId);
  if (config) {
    config.allowedPaths.push(normalizePath(path));
  }
}

export function allowEnvForSession(sessionId: string, envVar: string): void {
  const config = sessionConfigs.get(sessionId);
  if (config) {
    config.allowedEnvVars.push(envVar);
  }
}
