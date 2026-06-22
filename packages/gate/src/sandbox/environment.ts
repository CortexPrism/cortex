import type { join } from '@std/path';
import { detectDependencies } from './dependency-detect.ts';
import { isDockerAvailable, isGVisorAvailable } from './executor.ts';
import type { SandboxResult, SandboxRuntime } from './executor.ts';
import type { DevEnvManifest } from './snapshot-types.ts';
import {
  debugLog,
  errorLog,
  infoLog,
  provisionLog,
  validateSandboxPath,
  warnLog,
} from './logger.ts';
import {
  buildContainerSecurityArgs,
  buildWorkspaceMountArg,
} from './security-args.ts';

const CONTAINER_PREFIX = 'cortex-env-';
const SLEEP_COMMAND = 'while true; do sleep 3600; done';

const LANGUAGE_IMAGES: Record<string, string> = {
  python: 'python:3.12-alpine',
  python3: 'python:3.12-alpine',
  javascript: 'node:22-alpine',
  js: 'node:22-alpine',
  typescript: 'denoland/deno:alpine',
  ts: 'denoland/deno:alpine',
  bash: 'alpine:3.20',
  sh: 'alpine:3.20',
  ruby: 'ruby:3.3-alpine',
  go: 'golang:1.22-alpine',
  rust: 'rust:1.78-alpine',
};

function generateId(): string {
  return `env-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 6)}`;
}

async function runDockerExec(
  containerName: string,
  command: string[],
  timeoutMs: number,
  env?: Record<string, string>,
): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
  const envArgs: string[] = [];
  if (env) {
    for (const [k, v] of Object.entries(env)) {
      envArgs.push('-e', `${k}=${v}`);
    }
  }

  const args = ['exec', ...envArgs, containerName, ...command];

  const proc = new Deno.Command('docker', {
    args,
    stdout: 'piped',
    stderr: 'piped',
  });

  const child = proc.spawn();
  let timedOut = false;

  const timer = setTimeout(() => {
    try {
      child.kill('SIGTERM');
      setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch { /* gone */ }
      }, 2000);
    } catch { /* already exited */ }
  }, timeoutMs);

  const { code, stdout, stderr } = await child.output().catch(() => {
    timedOut = true;
    return { code: -1, stdout: new Uint8Array(), stderr: new Uint8Array() };
  });
  clearTimeout(timer);

  return {
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
    exitCode: code,
    timedOut,
  };
}

export interface SandboxEnvironmentOptions {
  workspacePath: string;
  manifest?: DevEnvManifest;
  language?: string;
  runtime?: SandboxRuntime;
  image?: string;
  memoryLimitMb?: number;
  cpuLimit?: number;
  networkMode?: 'none' | 'restricted' | 'full';
  timeoutMs?: number;
  env?: Record<string, string>;
  mountMode?: 'ro' | 'rw';
}

export interface SandboxEnvironmentSetupResult {
  ok: boolean;
  output: string;
  errors: string[];
}

export class SandboxEnvironment {
  readonly id: string;
  readonly workspacePath: string;
  readonly runtime: SandboxRuntime;
  readonly options: Required<Omit<SandboxEnvironmentOptions, 'manifest'>> & {
    manifest?: DevEnvManifest;
    mountMode: 'ro' | 'rw';
  };

  private _status: 'initializing' | 'ready' | 'error' = 'initializing';
  private _containerName: string;
  private _containerId: string | null = null;
  private _setupRun = false;
  private _destroyed = false;

  private constructor(
    id: string,
    opts: SandboxEnvironmentOptions & { runtime: SandboxRuntime },
  ) {
    this.id = id;
    this._containerName = `${CONTAINER_PREFIX}${id}`;
    this.workspacePath = opts.workspacePath;
    this.runtime = opts.runtime;
    this.options = {
      workspacePath: opts.workspacePath,
      language: opts.language ?? 'bash',
      runtime: opts.runtime,
      image: opts.image ?? LANGUAGE_IMAGES[opts.language ?? 'bash'] ?? 'alpine:3.20',
      memoryLimitMb: opts.memoryLimitMb ?? 256,
      cpuLimit: opts.cpuLimit ?? 0.5,
      networkMode: opts.networkMode ?? 'none',
      timeoutMs: opts.timeoutMs ?? 30_000,
      env: opts.env ?? {},
      manifest: opts.manifest,
      mountMode: opts.mountMode ?? 'rw',
    };
  }

  get status(): 'initializing' | 'ready' | 'error' {
    return this._status;
  }

  get containerId(): string | null {
    return this._containerId;
  }

  static async create(opts: SandboxEnvironmentOptions): Promise<SandboxEnvironment> {
    debugLog(provisionLog, 'SandboxEnvironment.create: validating path', {
      workspacePath: opts.workspacePath,
    });
    const pathCheck = validateSandboxPath(opts.workspacePath, 'workspacePath');
    if (!pathCheck.valid) {
      warnLog(provisionLog, `path rejected by sandbox validation: ${pathCheck.error}`, pathCheck);
    }

    const id = generateId();
    debugLog(provisionLog, `creating sandbox environment: ${id}`, {
      workspacePath: opts.workspacePath,
      language: opts.language,
      runtime: opts.runtime,
    });

    const dockerAvailable = await isDockerAvailable();
    if (!dockerAvailable) {
      errorLog(provisionLog, 'Docker is not available');
      throw new Error(
        'Docker is required for SandboxEnvironment. Run "docker info" to verify Docker is running.',
      );
    }

    const gvisorAvailable = await isGVisorAvailable();
    const runtime: SandboxRuntime = opts.runtime
      ? (opts.runtime === 'gvisor' && !gvisorAvailable ? 'docker' : opts.runtime)
      : (gvisorAvailable ? 'gvisor' : 'docker');

    if (opts.runtime === 'gvisor' && !gvisorAvailable) {
      warnLog(provisionLog, 'gVisor requested but not available, falling back to Docker');
    }

    const env = new SandboxEnvironment(id, { ...opts, runtime });
    await env._startContainer();
    infoLog(provisionLog, `sandbox environment created: ${id}`, {
      runtime,
      containerId: env._containerId,
    });
    return env;
  }

  private async _startContainer(): Promise<void> {
    const {
      image,
      memoryLimitMb,
      cpuLimit,
      networkMode,
      env: envVars,
      mountMode,
    } = this.options;

    debugLog(provisionLog, `starting container: ${this._containerName}`, {
      image,
      memoryLimitMb,
      cpuLimit,
      networkMode,
      runtime: this.runtime,
      mountMode,
    });

    const securityArgs = buildContainerSecurityArgs({
      memoryLimitMb,
      cpuLimit,
      pidsLimit: 64,
      readOnlyRoot: true,
      tmpfsSize: '256M',
      dropAllCapabilities: true,
      noNewPrivileges: true,
    });

    const mountArgs = buildWorkspaceMountArg({
      hostPath: this.workspacePath,
      containerPath: '/workspace',
      mode: mountMode,
    });

    const dockerArgs: string[] = [
      'run',
      '-d',
      '--name',
      this._containerName,
      '--network',
      networkMode === 'full' ? 'bridge' : 'none',
      ...securityArgs,
      ...mountArgs,
      '-w',
      '/workspace',
    ];

    if (this.runtime === 'gvisor') {
      dockerArgs.push('--runtime=runsc');
    }

    for (const [k, v] of Object.entries(envVars)) {
      dockerArgs.push('-e', `${k}=${v}`);
    }

    dockerArgs.push(image, 'sh', '-c', SLEEP_COMMAND);

    const proc = new Deno.Command('docker', {
      args: dockerArgs,
      stdout: 'piped',
      stderr: 'piped',
    });

    try {
      const { code, stdout, stderr } = await proc.output();
      if (code !== 0) {
        const errMsg = new TextDecoder().decode(stderr);
        this._status = 'error';
        errorLog(provisionLog, `failed to start container: ${this._containerName}`, {
          exitCode: code,
          stderr: errMsg,
          image,
        });
        throw new Error(`Failed to start sandbox container: ${errMsg}`);
      }
      this._containerId = new TextDecoder().decode(stdout).trim();
      this._status = 'ready';
      debugLog(provisionLog, `container started: ${this._containerId?.slice(0, 12)}`);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Failed to start')) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      this._status = 'error';
      errorLog(provisionLog, `failed to start container: ${this._containerName}`, { error: msg });
      throw new Error(`Failed to start sandbox container: ${msg}`);
    }
  }

  async setup(): Promise<SandboxEnvironmentSetupResult> {
    if (this._destroyed) throw new Error('SandboxEnvironment has been destroyed');
    if (this._status !== 'ready') {
      warnLog(provisionLog, `setup called but environment not ready: ${this._status}`);
      return {
        ok: false,
        output: '',
        errors: [`Environment status is '${this._status}', not ready`],
      };
    }

    debugLog(provisionLog, `running setup for environment: ${this.id}`);
    const setupCommands = this.options.manifest?.workspace?.setupCommands ?? [];

    if (setupCommands.length === 0) {
      const deps = await detectDependencies(this.workspacePath);
      debugLog(provisionLog, 'detected dependencies', {
        language: deps.language,
        manager: deps.managerHint,
      });
      if (deps.language === 'javascript' && deps.managerHint !== 'none') {
        setupCommands.push(`${deps.managerHint} install`);
      } else if (deps.language === 'python') {
        setupCommands.push('pip install -r requirements.txt');
      }
    }

    if (setupCommands.length === 0) {
      debugLog(provisionLog, 'no setup commands needed');
      this._setupRun = true;
      return { ok: true, output: 'No setup commands needed', errors: [] };
    }

    debugLog(provisionLog, `running ${setupCommands.length} setup command(s)`, {
      commands: setupCommands,
    });

    const outputs: string[] = [];
    const errors: string[] = [];
    const timeoutMs = this.options.timeoutMs * 4;

    for (const cmd of setupCommands) {
      const result = await runDockerExec(
        this._containerName,
        ['sh', '-c', cmd],
        timeoutMs,
      );

      if (result.stdout.trim()) outputs.push(result.stdout.trim());
      if (result.stderr.trim()) outputs.push(result.stderr.trim());

      if (result.exitCode !== 0 || result.timedOut) {
        const err = result.timedOut
          ? `Command '${cmd}' timed out after ${timeoutMs}ms`
          : `Command '${cmd}' failed with exit code ${result.exitCode}`;
        errors.push(err);
        warnLog(provisionLog, `setup command failed: ${cmd}`, {
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          stderr: result.stderr.slice(0, 200),
        });
      } else {
        debugLog(provisionLog, `setup command succeeded: ${cmd}`);
      }
    }

    this._setupRun = true;
    infoLog(provisionLog, 'setup complete', {
      ok: errors.length === 0,
      commandCount: setupCommands.length,
      errorCount: errors.length,
    });

    return {
      ok: errors.length === 0,
      output: outputs.join('\n'),
      errors,
    };
  }

  async exec(code: string, language?: string): Promise<SandboxResult> {
    if (this._destroyed) throw new Error('SandboxEnvironment has been destroyed');
    if (this._status !== 'ready') {
      warnLog(provisionLog, `exec called but environment not ready: ${this._status}`);
      return {
        stdout: '',
        stderr: `Environment status is '${this._status}', not ready`,
        exitCode: 1,
        timedOut: false,
        durationMs: 0,
        runtime: this.runtime,
      };
    }

    const lang = language ?? this.options.language;
    debugLog(provisionLog, `exec in environment: ${this.id}`, {
      language: lang,
      codeLength: code.length,
    });

    let entrypoint: string[];
    if (['python', 'python3'].includes(lang)) {
      entrypoint = ['python3', '-c', code];
    } else if (['js', 'javascript'].includes(lang)) {
      entrypoint = ['node', '-e', code];
    } else if (['ts', 'typescript'].includes(lang)) {
      entrypoint = ['deno', 'eval', code];
    } else if (['bash', 'sh'].includes(lang)) {
      entrypoint = ['sh', '-c', code];
    } else if (lang === 'ruby') {
      entrypoint = ['ruby', '-e', code];
    } else if (lang === 'go') {
      const tmpFile = `/tmp/cortex-go-${Date.now().toString(36)}.go`;
      await runDockerExec(this._containerName, [
        'sh',
        '-c',
        `cat > ${tmpFile} <<'GOEOF'\n${code}\nGOEOF`,
      ], 5000);
      entrypoint = ['go', 'run', tmpFile];
    } else if (lang === 'rust') {
      const tmpFile = `/tmp/cortex-rs-${Date.now().toString(36)}.rs`;
      await runDockerExec(this._containerName, [
        'sh',
        '-c',
        `cat > ${tmpFile} <<'RSEOF'\n${code}\nRSEOF`,
      ], 5000);
      entrypoint = ['rustc', tmpFile, '-o', tmpFile.replace('.rs', '')];
      const compileResult = await runDockerExec(
        this._containerName,
        entrypoint,
        this.options.timeoutMs,
      );
      if (compileResult.exitCode !== 0) {
        return {
          stdout: '',
          stderr: compileResult.stderr || compileResult.stdout,
          exitCode: compileResult.exitCode,
          timedOut: compileResult.timedOut,
          durationMs: 0,
          runtime: this.runtime,
        };
      }
      entrypoint = [tmpFile.replace('.rs', '')];
    } else {
      entrypoint = ['sh', '-c', code];
    }

    const start = Date.now();
    const result = await runDockerExec(
      this._containerName,
      entrypoint,
      this.options.timeoutMs,
      this.options.env,
    );

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      durationMs: Date.now() - start,
      runtime: this.runtime,
    };
  }

  async destroy(): Promise<void> {
    if (this._destroyed) return;
    this._destroyed = true;

    debugLog(provisionLog, `destroying environment: ${this.id}`, {
      containerName: this._containerName,
    });

    const cleanup = async (args: string[]) => {
      try {
        await new Deno.Command('docker', {
          args,
          stdout: 'null',
          stderr: 'null',
        }).output();
      } catch { /* container already gone */ }
    };

    await cleanup(['stop', '--time', '5', this._containerName]);
    await cleanup(['rm', '-f', this._containerName]);

    infoLog(provisionLog, `environment destroyed: ${this.id}`);

    this._status = 'error';
    this._containerId = null;
  }
}
