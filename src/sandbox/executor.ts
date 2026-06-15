const TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 64 * 1024;

export type SandboxRuntime = 'docker' | 'subprocess' | 'gvisor';

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

const SUBPROCESS_RUNNERS: Record<string, string[]> = {
  python: ['python3', '-c'],
  python3: ['python3', '-c'],
  js: ['node', '-e'],
  javascript: ['node', '-e'],
  bash: ['bash', '-c'],
  sh: ['sh', '-c'],
  ts: ['deno', 'eval'],
  typescript: ['deno', 'eval'],
  ruby: ['ruby', '-e'],
};

export async function getAvailableRuntime(): Promise<SandboxRuntime> {
  const dockerOk = await isDockerAvailable();
  if (dockerOk) {
    const gvisorOk = await isGVisorAvailable();
    return gvisorOk ? 'gvisor' : 'docker';
  }
  return 'subprocess';
}

export async function isDockerAvailable(): Promise<boolean> {
  try {
    const proc = new Deno.Command('docker', {
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

async function runInDocker(opts: SandboxOptions): Promise<SandboxResult> {
  const start = Date.now();
  const lang = opts.language.toLowerCase();
  const image = DOCKER_IMAGES[lang] ?? 'alpine:3.20';
  const timeout = opts.timeoutMs ?? TIMEOUT_MS;

  const envArgs: string[] = [];
  for (const [k, v] of Object.entries(opts.env ?? {})) {
    envArgs.push('-e', `${k}=${v}`);
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
  const timer = setTimeout(() => child.kill('SIGTERM'), timeout);
  let timedOut = false;

  if (opts.stdin) {
    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(opts.stdin));
    await writer.close();
  }

  const { code, stdout, stderr } = await child.output().catch(() => {
    timedOut = true;
    return { code: -1, stdout: new Uint8Array(), stderr: new Uint8Array() };
  });
  clearTimeout(timer);

  return {
    stdout: new TextDecoder().decode(stdout.slice(0, MAX_OUTPUT_BYTES)),
    stderr: new TextDecoder().decode(stderr.slice(0, MAX_OUTPUT_BYTES)),
    exitCode: code,
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

  const envVars: Record<string, string> = { ...Deno.env.toObject(), ...(opts.env ?? {}) };

  const proc = new Deno.Command(runner[0], {
    args: [...runner.slice(1), opts.code],
    cwd: opts.workingDir,
    stdout: 'piped',
    stderr: 'piped',
    stdin: opts.stdin ? 'piped' : 'null',
    env: envVars,
  });

  const child = proc.spawn();
  const timer = setTimeout(() => child.kill('SIGTERM'), timeout);
  let timedOut = false;

  if (opts.stdin) {
    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(opts.stdin));
    await writer.close();
  }

  const { code, stdout, stderr } = await child.output().catch(() => {
    timedOut = true;
    return { code: -1, stdout: new Uint8Array(), stderr: new Uint8Array() };
  });
  clearTimeout(timer);

  return {
    stdout: new TextDecoder().decode(stdout.slice(0, MAX_OUTPUT_BYTES)),
    stderr: new TextDecoder().decode(stderr.slice(0, MAX_OUTPUT_BYTES)),
    exitCode: code,
    timedOut,
    durationMs: Date.now() - start,
    runtime: 'subprocess',
  };
}

export async function runInSandbox(opts: SandboxOptions): Promise<SandboxResult> {
  const runtime = opts.runtime ?? (await isDockerAvailable() ? 'docker' : 'subprocess');

  if (runtime === 'docker') {
    return await runInDocker(opts);
  }
  return await runSubprocess(opts);
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
