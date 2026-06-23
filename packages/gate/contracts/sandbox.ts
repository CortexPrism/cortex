/**
 * Sandbox contracts — aspirational multi-backend abstraction layer.
 *
 * NOTE: ISandboxProvider and ISandboxBackend are currently not implemented.
 * The active sandbox executor (src/sandbox/executor.ts) uses direct functions
 * rather than this contract boundary. These interfaces serve as a reference
 * for a future multi-backend sandbox system (docker / subprocess / gVisor /
 * E2B / Daytona).
 */

export type SandboxRuntime = 'docker' | 'subprocess' | 'gvisor' | 'e2b' | 'daytona';

export interface ISandboxOptions {
  code: string;
  language: string;
  stdin?: string;
  timeoutMs?: number;
  runtime?: SandboxRuntime;
  workingDir?: string;
  env?: Record<string, string>;
  mountMode?: 'ro' | 'rw';
}

export interface ISandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  durationMs: number;
  runtime: SandboxRuntime;
}

export interface ISandboxBackend {
  name: string;
  available: boolean;
  start?(): Promise<void>;
  stop?(): Promise<void>;
}

export interface ISandboxProvider {
  execute(code: string, opts: ISandboxOptions): Promise<ISandboxResult>;
}
