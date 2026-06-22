export type SandboxRuntime = 'docker' | 'subprocess' | 'gvisor' | 'e2b' | 'daytona';

export interface ISandboxOptions {
  code: string;
  language: string;
  stdin?: string;
  timeoutMs?: number;
  runtime?: SandboxRuntime;
  workingDir?: string;
  env?: Record<string, string>;
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
