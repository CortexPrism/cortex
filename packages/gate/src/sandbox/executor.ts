import { buildSandboxCommand as buildSecureSandbox } from './agent-sandbox.ts';
import { debugLog, errorLog, execLog, infoLog, type sandboxLog, warnLog } from './logger.ts';

const TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 64 * 1024;

export type SandboxRuntime = 'docker' | 'subprocess' | 'gvisor' | 'e2b' | 'daytona';

export interface SandboxOptions {
  code: string;
  language: string;
  stdin?: string;
  timeoutMs?: number;
  runtime?: SandboxRuntime;
  workingDir?: string;
  env?: Record<string, string>;
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  durationMs: number;
  runtime: SandboxRuntime;
}

function isWindows(): boolean {
  return Deno.build.os === 'windows';
}

function killProcess(child: Deno.ChildProcess): void {
  try {
    if (isWindows()) {
      child.kill();
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    // already exited
  }
}

const DOCKER_IMAGES: Record<string, string> = {
  python: 'python:3.12-alpine',
  python3: 'python:3.12-alpine',
  js: 'node:22-alpine',
  javascript: 'node:22-alpine',
  ts: 'denoland/deno:alpine',
  typescript: 'denoland/deno:alpine',
  bash: 'alpine:3.20',
  sh: 'alpine:3.20',
  ruby: 'ruby:3.3-alpine',
  go: 'golang:1.22-alpine',
  rust: 'rust:1.78-alpine',
};

const SUBPROCESS_RUNNERS: Record<string, string[]> = (() => {
  const win = isWindows();
  return {
    python: [win ? 'python.exe' : 'python3', '-c'],
    python3: [win ? 'python.exe' : 'python3', '-c'],
    js: [win ? 'node.exe' : 'node', '-e'],
    javascript: [win ? 'node.exe' : 'node', '-e'],
    bash: [win ? 'bash.exe' : 'bash', '-c'],
    sh: [win ? 'bash.exe' : 'sh', '-c'],
    ts: [win ? 'deno.exe' : 'deno', 'eval'],
    typescript: [win ? 'deno.exe' : 'deno', 'eval'],
    ruby: [win ? 'ruby.exe' : 'ruby', '-e'],
  };
})();

export async function getAvailableRuntime(): Promise<SandboxRuntime> {
  const dockerOk = await isDockerAvailable();
  debugLog(execLog, 'runtime probe', { docker: dockerOk });
  if (dockerOk) {
    const gvisorOk = await isGVisorAvailable();
    const runtime = gvisorOk ? 'gvisor' : 'docker';
    infoLog(execLog, `runtime selected: ${runtime}`);
    return runtime as SandboxRuntime;
  }
  infoLog(execLog, 'runtime selected: subprocess (fallback)');
  return 'subprocess';
}

export async function isDockerAvailable(): Promise<boolean> {
  try {
    const cmdName = isWindows() ? 'docker.exe' : 'docker';
    const proc = new Deno.Command(cmdName, {
      args: ['info', '--format', '{{.ServerVersion}}'],
      stdout: 'piped',
      stderr: 'null',
    });
    const { code } = await proc.output();
    return code === 0;
  } catch {
    return false;
  }
}

export function getDockerNotAvailableMessage(): string {
  if (Deno.build.os === 'darwin') {
    return 'Docker not found. Install Docker Desktop from https://www.docker.com/products/docker-desktop/';
  }
  if (Deno.build.os === 'windows') {
    return 'Docker not found. Install Docker Desktop (requires WSL2) from https://www.docker.com/products/docker-desktop/';
  }
  return 'Docker not found. Install Docker Engine: https://docs.docker.com/engine/install/';
}

let gvisorAvailable: boolean | undefined;

export async function isGVisorAvailable(): Promise<boolean> {
  if (gvisorAvailable !== undefined) return gvisorAvailable;
  try {
    const proc = new Deno.Command('docker', {
      args: ['info', '--format', '{{.Runtimes}}'],
      stdout: 'piped',
      stderr: 'null',
    });
    const output = await proc.output();
    gvisorAvailable = output.code === 0 &&
      new TextDecoder().decode(output.stdout).includes('runsc');
    return gvisorAvailable;
  } catch {
    gvisorAvailable = false;
    return false;
  }
}

async function runDockerCommand(
  args: string[],
  timeout: number,
  stdin: string | undefined,
  start: number,
): Promise<SandboxResult> {
  const proc = new Deno.Command('docker', {
    args: args.slice(1),
    stdout: 'piped',
    stderr: 'piped',
    stdin: stdin ? 'piped' : 'null',
  });

  const child = proc.spawn();
  let timedOut = false;
  const timer = setTimeout(() => {
    warnLog(execLog, `execution timed out after ${timeout}ms, sending kill signal`);
    try {
      if (isWindows()) {
        child.kill();
      } else {
        child.kill('SIGTERM');
        setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch {
            // already exited
          }
        }, 2000);
      }
    } catch {
      // already exited
    }
  }, timeout);

  if (stdin) {
    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(stdin));
    await writer.close();
  }

  const output = await child.output().catch(() => {
    timedOut = true;
    return { code: -1, stdout: new Uint8Array(), stderr: new Uint8Array() };
  });
  clearTimeout(timer);

  return {
    stdout: new TextDecoder().decode(output.stdout.slice(0, MAX_OUTPUT_BYTES)),
    stderr: new TextDecoder().decode(output.stderr.slice(0, MAX_OUTPUT_BYTES)),
    exitCode: output.code,
    timedOut,
    durationMs: Date.now() - start,
    runtime: 'docker',
  };
}

async function runInDocker(opts: SandboxOptions): Promise<SandboxResult> {
  const start = Date.now();
  const lang = opts.language.toLowerCase();
  const image = DOCKER_IMAGES[lang] ?? 'alpine:3.20';
  const timeout = opts.timeoutMs ?? TIMEOUT_MS;

  const envArgs: string[] = [];
  for (const [k, v] of Object.entries(opts.env ?? {})) {
    envArgs.push('-e', `${k}=${v}`);
  }

  if (opts.workingDir && ['ts', 'typescript'].includes(lang)) {
    const networkMode = 'none' as const;
    const secureArgs = buildSecureSandbox({
      image,
      workspaceMount: opts.workingDir,
      networkMode,
      memoryLimitMb: 256,
      cpuLimit: 0.5,
      timeoutMs: timeout,
      env: opts.env,
    });
    return await runDockerCommand(secureArgs, timeout, opts.stdin, start);
  }

  let entrypoint: string[];
  if (['python', 'python3'].includes(lang)) {
    entrypoint = ['python3', '-c', opts.code];
  } else if (['js', 'javascript'].includes(lang)) {
    entrypoint = ['node', '-e', opts.code];
  } else if (['ts', 'typescript'].includes(lang)) {
    entrypoint = ['deno', 'eval', opts.code];
  } else if (['bash', 'sh'].includes(lang)) {
    entrypoint = ['sh', '-c', opts.code];
  } else if (lang === 'ruby') {
    entrypoint = ['ruby', '-e', opts.code];
  } else {
    entrypoint = ['sh', '-c', opts.code];
  }

  const args = [
    'run',
    '--rm',
    ...(opts.runtime === 'gvisor' ? ['--runtime=runsc'] : []),
    '--network=none',
    '--memory=256m',
    '--cpus=0.5',
    '--pids-limit=64',
    '--security-opt=no-new-privileges',
    ...envArgs,
    image,
    ...entrypoint,
  ];

  const proc = new Deno.Command('docker', {
    args,
    stdout: 'piped',
    stderr: 'piped',
    stdin: opts.stdin ? 'piped' : 'null',
  });

  const child = proc.spawn();
  let timedOut = false;
  const timer = setTimeout(() => {
    warnLog(execLog, `execution timed out after ${timeout}ms, sending kill signal`);
    try {
      if (isWindows()) {
        child.kill();
      } else {
        child.kill('SIGTERM');
        setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch {
            // already exited
          }
        }, 2000);
      }
    } catch {
      // already exited
    }
  }, timeout);

  if (opts.stdin) {
    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(opts.stdin));
    await writer.close();
  }

  const output = await child.output().catch(() => {
    timedOut = true;
    return { code: -1, stdout: new Uint8Array(), stderr: new Uint8Array() };
  });
  clearTimeout(timer);

  return {
    stdout: new TextDecoder().decode(output.stdout.slice(0, MAX_OUTPUT_BYTES)),
    stderr: new TextDecoder().decode(output.stderr.slice(0, MAX_OUTPUT_BYTES)),
    exitCode: output.code,
    timedOut,
    durationMs: Date.now() - start,
    runtime: 'docker',
  };
}

async function runSubprocess(opts: SandboxOptions): Promise<SandboxResult> {
  const start = Date.now();
  const lang = opts.language.toLowerCase();
  const timeout = opts.timeoutMs ?? TIMEOUT_MS;
  const runner = SUBPROCESS_RUNNERS[lang];

  if (!runner) {
    return {
      stdout: '',
      stderr: `No subprocess runner for language: ${lang}`,
      exitCode: 1,
      timedOut: false,
      durationMs: Date.now() - start,
      runtime: 'subprocess',
    };
  }

  const envVars: Record<string, string> = {};
  const rawEnv = Deno.env.toObject();
  const SENSITIVE_KEY_PATTERNS = ['PASSWORD', 'SECRET', 'TOKEN', 'KEY', 'VAULT', 'API_KEY'];
  for (const [k, v] of Object.entries(rawEnv)) {
    const upper = k.toUpperCase();
    if (SENSITIVE_KEY_PATTERNS.some((p) => upper.includes(p))) continue;
    envVars[k] = v;
  }
  if (opts.env) Object.assign(envVars, opts.env);

  const proc = new Deno.Command(runner[0], {
    args: [...runner.slice(1), opts.code],
    cwd: opts.workingDir,
    stdout: 'piped',
    stderr: 'piped',
    stdin: opts.stdin ? 'piped' : 'null',
    env: envVars,
  });

  const child = proc.spawn();
  let timedOut = false;
  const timer = setTimeout(() => {
    warnLog(execLog, `subprocess timed out after ${timeout}ms, sending kill signal`);
    try {
      if (isWindows()) {
        child.kill();
      } else {
        child.kill('SIGTERM');
        setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch {
            // already exited
          }
        }, 2000);
      }
    } catch {
      // already exited
    }
  }, timeout);

  if (opts.stdin) {
    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(opts.stdin));
    await writer.close();
  }

  const output = await child.output().catch(() => {
    timedOut = true;
    return { code: -1, stdout: new Uint8Array(), stderr: new Uint8Array() };
  });
  clearTimeout(timer);

  return {
    stdout: new TextDecoder().decode(output.stdout.slice(0, MAX_OUTPUT_BYTES)),
    stderr: new TextDecoder().decode(output.stderr.slice(0, MAX_OUTPUT_BYTES)),
    exitCode: output.code,
    timedOut,
    durationMs: Date.now() - start,
    runtime: 'subprocess',
  };
}

export async function runInSandbox(opts: SandboxOptions): Promise<SandboxResult> {
  const runtime = opts.runtime ?? (await isDockerAvailable() ? 'docker' : 'subprocess');

  debugLog(
    execLog,
    `runInSandbox: lang=${opts.language} runtime=${runtime} timeout=${
      opts.timeoutMs ?? TIMEOUT_MS
    }ms`,
    {
      codeLength: opts.code.length,
      hasStdin: !!opts.stdin,
      workingDir: opts.workingDir,
      hasEnv: !!opts.env && Object.keys(opts.env).length > 0,
    },
  );

  try {
    const result = runtime === 'docker' || runtime === 'gvisor'
      ? await runInDocker(opts)
      : await runSubprocess(opts);

    if (result.exitCode !== 0 || result.timedOut) {
      warnLog(
        execLog,
        `execution result: exit=${result.exitCode} timedOut=${result.timedOut} duration=${result.durationMs}ms`,
        {
          stderr: result.stderr.slice(0, 200),
          runtime: result.runtime,
        },
      );
    } else {
      debugLog(execLog, `execution success: duration=${result.durationMs}ms`, {
        stdoutLen: result.stdout.length,
        runtime: result.runtime,
      });
    }

    return result;
  } catch (e) {
    errorLog(execLog, `execution error: ${e instanceof Error ? e.message : String(e)}`, {
      language: opts.language,
      runtime,
    });
    throw e;
  }
}

export function formatSandboxResult(result: SandboxResult): string {
  const parts: string[] = [];

  if (result.timedOut) {
    parts.push(`[TIMEOUT after ${result.durationMs}ms]`);
  }

  if (result.stdout.trim()) {
    parts.push(`stdout:\n${result.stdout.trimEnd()}`);
  }

  if (result.stderr.trim()) {
    parts.push(`stderr:\n${result.stderr.trimEnd()}`);
  }

  parts.push(`exit: ${result.exitCode} · ${result.durationMs}ms · via ${result.runtime}`);
  return parts.join('\n\n');
}
