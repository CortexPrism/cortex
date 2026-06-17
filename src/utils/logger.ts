import { join } from '@std/path';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVEL_RANK: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  silent: 5,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  trace: '\x1b[90m',
  debug: '\x1b[36m',
  info: '\x1b[32m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  silent: '',
};

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

export interface LogEntry {
  ts: string;
  level: LogLevel;
  ns: string;
  msg: string;
  data?: unknown;
}

export interface LogTransport {
  write(entry: LogEntry): void;
}

// ── File transport ──────────────────────────────────────────────────────────

interface FileTransportOptions {
  path: string;
  maxBytes?: number;
  maxFiles?: number;
}

class FileTransport implements LogTransport {
  private path: string;
  private maxBytes: number;
  private maxFiles: number;
  private size = 0;
  private ready = false;
  private queue: string[] = [];
  private flushing = false;

  constructor(opts: FileTransportOptions) {
    this.path = opts.path;
    this.maxBytes = opts.maxBytes ?? 10_485_760;
    this.maxFiles = opts.maxFiles ?? 5;
    this.init().catch(() => {});
  }

  private async init(): Promise<void> {
    try {
      await Deno.mkdir(join(this.path, '..'), { recursive: true });
      try {
        const stat = await Deno.stat(this.path);
        this.size = stat.size;
      } catch {
        this.size = 0;
      }
      this.ready = true;
      if (this.queue.length > 0) this.flush().catch(() => {});
    } catch {
      // File transport init failure is non-fatal
    }
  }

  write(entry: LogEntry): void {
    const line = JSON.stringify(entry) + '\n';
    this.queue.push(line);
    if (this.ready && !this.flushing) {
      this.flush().catch(() => {});
    }
  }

  private async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return;
    this.flushing = true;
    const batch = this.queue.splice(0);
    const text = batch.join('');
    try {
      this.size += new TextEncoder().encode(text).length;
      await Deno.writeTextFile(this.path, text, { append: true });
      if (this.size >= this.maxBytes) {
        await this.rotate();
      }
    } catch {
      // Write failure is non-fatal
    } finally {
      this.flushing = false;
      if (this.queue.length > 0) this.flush().catch(() => {});
    }
  }

  private async rotate(): Promise<void> {
    try {
      for (let i = this.maxFiles - 1; i >= 1; i--) {
        const from = `${this.path}.${i}`;
        const to = `${this.path}.${i + 1}`;
        try {
          await Deno.rename(from, to);
        } catch {
          // skip missing files
        }
      }
      await Deno.rename(this.path, `${this.path}.1`);
      this.size = 0;
    } catch {
      // rotation failure is non-fatal
    }
  }
}

// ── Stdout transport ────────────────────────────────────────────────────────

class StdoutTransport implements LogTransport {
  private useColor: boolean;

  constructor() {
    this.useColor = Deno.stdout.isTerminal();
  }

  write(entry: LogEntry): void {
    const time = entry.ts.slice(11, 23); // HH:mm:ss.mmm
    const ns = entry.ns ? ` ${entry.ns}` : '';
    if (this.useColor) {
      const c = LEVEL_COLORS[entry.level];
      const lvl = entry.level.toUpperCase().padEnd(5);
      const dataStr = entry.data !== undefined
        ? ` ${DIM}${JSON.stringify(entry.data)}${RESET}`
        : '';
      console.log(
        `${DIM}${time}${RESET} ${c}${lvl}${RESET}${DIM}${ns}${RESET} ${entry.msg}${dataStr}`,
      );
    } else {
      const lvl = entry.level.toUpperCase().padEnd(5);
      const dataStr = entry.data !== undefined ? ` ${JSON.stringify(entry.data)}` : '';
      console.log(`${time} ${lvl}${ns} ${entry.msg}${dataStr}`);
    }
  }
}

// ── Logger core ─────────────────────────────────────────────────────────────

export interface Logger {
  trace(msg: string, data?: unknown): void;
  debug(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
  child(subNs: string): Logger;
}

class LoggerImpl implements Logger {
  constructor(
    private ns: string,
    private registry: LoggerRegistry,
  ) {}

  trace(msg: string, data?: unknown): void {
    this.registry.emit('trace', this.ns, msg, data);
  }
  debug(msg: string, data?: unknown): void {
    this.registry.emit('debug', this.ns, msg, data);
  }
  info(msg: string, data?: unknown): void {
    this.registry.emit('info', this.ns, msg, data);
  }
  warn(msg: string, data?: unknown): void {
    this.registry.emit('warn', this.ns, msg, data);
  }
  error(msg: string, data?: unknown): void {
    this.registry.emit('error', this.ns, msg, data);
  }
  child(subNs: string): Logger {
    return new LoggerImpl(this.ns ? `${this.ns}:${subNs}` : subNs, this.registry);
  }
}

// ── Registry (singleton) ────────────────────────────────────────────────────

export interface LoggerConfig {
  level: LogLevel;
  fileEnabled: boolean;
  filePath?: string;
  fileMaxBytes?: number;
  fileMaxFiles?: number;
}

// FILE_MIN_LEVEL: floor for the file transport when global level is error or silent.
// When global level is more verbose (trace/debug/info/warn) the file uses the global level.
const FILE_FLOOR: LogLevel = 'warn';

class LoggerRegistry {
  private level: LogLevel = 'error';
  private extraTransports: LogTransport[] = [];
  private fileTransport: FileTransport | null = null;
  private stdoutTransport: StdoutTransport | null = null;

  configure(config: LoggerConfig): void {
    this.level = config.level;

    // Stdout transport: active whenever level is not silent
    if (config.level !== 'silent') {
      if (!this.stdoutTransport) {
        this.stdoutTransport = new StdoutTransport();
      }
    } else {
      this.stdoutTransport = null;
    }

    // File transport: always write FILE_MIN_LEVEL+ to file when enabled, independent of global level
    if (config.fileEnabled && config.filePath) {
      if (!this.fileTransport) {
        this.fileTransport = new FileTransport({
          path: config.filePath,
          maxBytes: config.fileMaxBytes,
          maxFiles: config.fileMaxFiles,
        });
      }
    } else if (!config.fileEnabled) {
      this.fileTransport = null;
    }
  }

  addTransport(transport: LogTransport): void {
    this.extraTransports.push(transport);
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  emit(level: LogLevel, ns: string, msg: string, data?: unknown): void {
    const rank = LEVEL_RANK[level];
    const globalRank = LEVEL_RANK[this.level];
    // File uses the configured level when it's more verbose than the floor, otherwise floor
    const fileRank = Math.min(globalRank, LEVEL_RANK[FILE_FLOOR]);

    // Fast exit: nothing would receive this entry
    if (rank < globalRank && rank < fileRank) return;

    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      ns,
      msg,
      ...(data !== undefined ? { data } : {}),
    };

    // Stdout: gated by global level
    if (this.stdoutTransport && rank >= globalRank) {
      try { this.stdoutTransport.write(entry); } catch { /* non-fatal */ }
    }

    // File: uses configured level (or warn floor, whichever is lower rank)
    if (this.fileTransport && rank >= fileRank) {
      try { this.fileTransport.write(entry); } catch { /* non-fatal */ }
    }

    // Extra transports (OTLP, Langfuse, custom): gated by global level
    if (rank >= globalRank) {
      for (const t of this.extraTransports) {
        try { t.write(entry); } catch { /* non-fatal */ }
      }
    }
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

const _registry = new LoggerRegistry();

// Read level from env at module load time
const _envLevel = Deno.env.get('CORTEX_LOG_LEVEL') as LogLevel | undefined;
if (_envLevel && _envLevel in LEVEL_RANK) {
  _registry.setLevel(_envLevel);
}

/**
 * Configure the global logger (called once at startup from main/server entry).
 * Safe to call multiple times; subsequent calls update the level.
 */
export function configureLogger(config: LoggerConfig): void {
  const envLevel = Deno.env.get('CORTEX_LOG_LEVEL') as LogLevel | undefined;
  const effectiveLevel = (envLevel && envLevel in LEVEL_RANK) ? envLevel : config.level;
  _registry.configure({ ...config, level: effectiveLevel });
}

/** Add an external transport (e.g. Langfuse, OTLP log exporter). */
export function addLogTransport(transport: LogTransport): void {
  _registry.addTransport(transport);
}

/** Change the active log level at runtime. */
export function setLogLevel(level: LogLevel): void {
  _registry.setLevel(level);
}

/** Get the current log level. */
export function getLogLevel(): LogLevel {
  return _registry.getLevel();
}

/**
 * Get a namespaced logger.
 * Usage: `const log = logger('agent:loop');`
 */
export function logger(ns = ''): Logger {
  return new LoggerImpl(ns, _registry);
}

/** Root-level convenience logger (no namespace). */
export const log: Logger = new LoggerImpl('', _registry);
