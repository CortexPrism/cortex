/**
 * Structured channel logger utility
 */

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

let gLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  gLevel = level;
}

const LEVEL_PRIO: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIO[level] >= LEVEL_PRIO[gLevel];
}

export function createLogger(prefix: string) {
  return {
    trace(msg: string, data?: unknown) {
      if (shouldLog('trace')) {
        console.debug(`[${prefix}] [trace] ${msg}`, data !== undefined ? data : '');
      }
    },
    debug(msg: string, data?: unknown) {
      if (shouldLog('debug')) {
        console.debug(`[${prefix}] [debug] ${msg}`, data !== undefined ? data : '');
      }
    },
    info(msg: string, data?: unknown) {
      if (shouldLog('info')) {
        console.log(`[${prefix}] ${msg}`, data !== undefined ? data : '');
      }
    },
    warn(msg: string, data?: unknown) {
      if (shouldLog('warn')) {
        console.warn(`[${prefix}] [warn] ${msg}`, data !== undefined ? data : '');
      }
    },
    error(msg: string, data?: unknown) {
      if (shouldLog('error')) {
        console.error(`[${prefix}] [error] ${msg}`, data !== undefined ? data : '');
      }
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
