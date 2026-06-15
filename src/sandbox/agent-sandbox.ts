export { isDockerAvailable, isGVisorAvailable } from './executor.ts';

export interface SandboxOptions {
  image?: string;
  workspaceMount: string;
  networkMode: 'none' | 'restricted' | 'full';
  memoryLimitMb?: number;
  cpuLimit?: number;
  timeoutMs: number;
  env?: Record<string, string>;
}

export function buildSandboxCommand(opts: SandboxOptions): string[] {
  const args: string[] = [
    'docker',
    'run',
    '--rm',
    '--network',
    opts.networkMode === 'none' ? 'none' : 'bridge',
    `--memory=${opts.memoryLimitMb ?? 512}m`,
    `--cpus=${opts.cpuLimit ?? 1.0}`,
    '--pids-limit=128',
    '--security-opt=no-new-privileges',
    '--read-only',
    '--tmpfs=/tmp:rw,noexec,nosuid,size=256M',
    '-v',
    `${opts.workspaceMount}:/workspace:rw`,
    '-w',
    '/workspace',
  ];

  if (opts.env) {
    for (const [k, v] of Object.entries(opts.env)) {
      args.push('-e', `${k}=${v}`);
    }
  }

  args.push(
    opts.image ?? 'denoland/deno:alpine',
    'deno',
    'run',
    '--allow-read=/workspace',
    '--allow-write=/workspace',
    '--allow-run',
    '--allow-env',
    '--allow-net=deno.land,jsr.io',
  );

  return args;
}

export function buildGVisorCommand(opts: SandboxOptions): string[] {
  const args: string[] = [
    'docker',
    'run',
    '--rm',
    '--runtime=runsc',
    '--network',
    opts.networkMode === 'none' ? 'none' : 'bridge',
    `--memory=${opts.memoryLimitMb ?? 512}m`,
    `--cpus=${opts.cpuLimit ?? 1.0}`,
    '--pids-limit=128',
    '-v',
    `${opts.workspaceMount}:/workspace:rw`,
    '-w',
    '/workspace',
  ];

  if (opts.env) {
    for (const [k, v] of Object.entries(opts.env)) {
      args.push('-e', `${k}=${v}`);
    }
  }

  args.push(
    opts.image ?? 'denoland/deno:alpine',
    'deno',
    'run',
    '--allow-read=/workspace',
    '--allow-write=/workspace',
    '--allow-run',
    '--allow-env',
  );

  return args;
}
