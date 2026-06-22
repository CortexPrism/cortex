export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent';

export interface ILogEntry {
  ts: string;
  level: LogLevel;
  ns: string;
  msg: string;
  data?: unknown;
  reqId?: string;
  stack?: string;
}

export interface ILogger {
  trace(msg: string, data?: unknown): void;
  debug(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
  child(subNs: string): ILogger;
}
