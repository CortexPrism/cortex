import { type Logger, logger as createLogger } from '../../../../src/utils/logger.ts';
import { PATHS } from '../../../../src/config/paths.ts';
import { normalize, resolve } from '@std/path';

let _sandboxDebug = false;
let _sandboxLogLevel: string | null = null;

function readEnvDebug(): boolean {
  const val = Deno.env.get('CORTEX_SANDBOX_DEBUG');
  if (val === '1' || val === 'true' || val === 'TRUE') return true;
  const level = Deno.env.get('CORTEX_SANDBOX_LOG_LEVEL');
  if (level === 'trace' || level === 'debug') {
    _sandboxLogLevel = level;
    return true;
  }
  return false;
}

function initSandboxDebug(): boolean {
  if (_sandboxDebug) return true;
  _sandboxDebug = readEnvDebug();
  return _sandboxDebug;
}

export function isSandboxDebug(): boolean {
  return _sandboxDebug || initSandboxDebug();
}

export function setSandboxDebug(enabled: boolean): void {
  const prev = _sandboxDebug;
  _sandboxDebug = enabled;
  if (!enabled) _sandboxLogLevel = null;
  sandboxLog.info(
    `sandbox debug ${enabled ? 'enabled' : 'disabled'}${prev !== enabled ? ' (changed)' : ''}`,
  );
}

export function toggleSandboxDebug(): boolean {
  setSandboxDebug(!isSandboxDebug());
  return _sandboxDebug;
}

export function getLogLevel(): string | null {
  if (_sandboxLogLevel === undefined) initSandboxDebug();
  return _sandboxLogLevel;
}

const _rootLog = createLogger('sandbox');

export const sandboxLog: Logger = _rootLog;
export const execLog: Logger = _rootLog.child('exec');
export const snapshotLog: Logger = _rootLog.child('snapshot');
export const envLog: Logger = _rootLog.child('env');
export const workspaceLog: Logger = _rootLog.child('workspace');
export const devEnvLog: Logger = _rootLog.child('devenv');
export const bugReproLog: Logger = _rootLog.child('bugrepro');
export const autofixLog: Logger = _rootLog.child('autofix');
export const depsLog: Logger = _rootLog.child('deps');
export const gitLog: Logger = _rootLog.child('git');
export const provisionLog: Logger = _rootLog.child('provision');

export function debugLog(logger: Logger, msg: string, data?: unknown): void {
  if (isSandboxDebug()) {
    logger.debug(msg, data);
  }
}

export function traceLog(logger: Logger, msg: string, data?: unknown): void {
  if (isSandboxDebug()) {
    logger.trace(msg, data);
  }
}

export function warnLog(logger: Logger, msg: string, data?: unknown): void {
  logger.warn(msg, data);
}

export function errorLog(logger: Logger, msg: string, data?: unknown): void {
  logger.error(msg, data);
}

export function infoLog(logger: Logger, msg: string, data?: unknown): void {
  logger.info(msg, data);
}

export interface PathValidationResult {
  valid: boolean;
  error?: string;
  normalized?: string;
  roots?: string[];
}

export function validateSandboxPath(inputPath: string, fieldName: string): PathValidationResult {
  const roots = [
    normalize(resolve(PATHS.workspacesDir)),
    normalize(resolve(PATHS.dataDir)),
    normalize(resolve(Deno.cwd())),
  ];

  debugLog(sandboxLog, `validating ${fieldName}`, {
    inputPath,
    roots,
  });

  if (!inputPath || inputPath.includes('..')) {
    const err = `Invalid ${fieldName}: path traversal not allowed`;
    warnLog(sandboxLog, err, { inputPath });
    return { valid: false, error: err, roots };
  }

  const normalized = normalize(resolve(inputPath));

  let realPath: string;
  try {
    realPath = Deno.realPathSync(normalized);
  } catch {
    realPath = normalized;
  }

  const forbiddenPrefixes = ['/proc', '/sys', '/dev', '/run'];
  for (const prefix of forbiddenPrefixes) {
    if (realPath === prefix || realPath.startsWith(prefix + '/')) {
      const err = `Invalid ${fieldName}: path within forbidden system directory (${prefix})`;
      warnLog(sandboxLog, err, { inputPath, realPath });
      return { valid: false, error: err, normalized: realPath, roots };
    }
  }

  const within = roots.some((r) => realPath === r || realPath.startsWith(r + '/'));

  if (!within) {
    const err = `Invalid ${fieldName}: path must be within workspaces or data directory`;
    warnLog(sandboxLog, err, { inputPath, realPath, roots });
    return { valid: false, error: err, normalized: realPath, roots };
  }

  debugLog(sandboxLog, `${fieldName} valid`, {
    inputPath,
    normalized: realPath,
    matchedRoot: roots.find((r) => realPath === r || realPath.startsWith(r + '/')),
  });

  return { valid: true, normalized: realPath, roots };
}
