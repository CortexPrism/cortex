import { debugLog, execLog } from './logger.ts';
import { buildContainerSecurityArgs, buildWorkspaceMountArg } from './security-args.ts';

export { isDockerAvailable, isGVisorAvailable } from './executor.ts';

export interface AgentSandboxOptions {
  image?: string;
  workspaceMount: string;
  networkMode: 'none' | 'restricted' | 'full';
  memoryLimitMb?: number;
  cpuLimit?: number;
  timeoutMs: number;
  env?: Record<string, string>;
  mountMode?: 'ro' | 'rw';
}

export function buildSandboxCommand(opts: AgentSandboxOptions): string[] {
  debugLog(execLog, 'building sandbox command', {
    image: opts.image,
    networkMode: opts.networkMode,
    memoryLimitMb: opts.memoryLimitMb,
    cpuLimit: opts.cpuLimit,
    mountMode: opts.mountMode,
  });

  const securityArgs = buildContainerSecurityArgs({
    memoryLimitMb: opts.memoryLimitMb ?? 512,
    cpuLimit: opts.cpuLimit ?? 1.0,
    pidsLimit: 128,
    readOnlyRoot: true,
    tmpfsSize: '256M',
    dropAllCapabilities: true,
    noNewPrivileges: true,
  });

  const mountArgs = buildWorkspaceMountArg({
    hostPath: opts.workspaceMount,
    containerPath: '/workspace',
    mode: opts.mountMode ?? 'rw',
  });

  const args: string[] = [
    'docker',
    'run',
    '--rm',
    '--network',
    opts.networkMode === 'none' ? 'none' : 'bridge',
    ...securityArgs,
    ...mountArgs,
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

export function buildGVisorCommand(opts: AgentSandboxOptions): string[] {
  const securityArgs = buildContainerSecurityArgs({
    memoryLimitMb: opts.memoryLimitMb ?? 512,
    cpuLimit: opts.cpuLimit ?? 1.0,
    pidsLimit: 128,
    readOnlyRoot: true,
    tmpfsSize: '256M',
    dropAllCapabilities: true,
    noNewPrivileges: true,
  });

  const mountArgs = buildWorkspaceMountArg({
    hostPath: opts.workspaceMount,
    containerPath: '/workspace',
    mode: opts.mountMode ?? 'rw',
  });

  const args: string[] = [
    'docker',
    'run',
    '--rm',
    '--runtime=runsc',
    '--network',
    opts.networkMode === 'none' ? 'none' : 'bridge',
    ...securityArgs,
    ...mountArgs,
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
