import { debugLog, sandboxLog } from './logger.ts';

export interface ContainerSecurityConfig {
  memoryLimitMb?: number;
  cpuLimit?: number;
  pidsLimit?: number;
  readOnlyRoot?: boolean;
  tmpfsSize?: string;
  dropAllCapabilities?: boolean;
  noNewPrivileges?: boolean;
}

export interface WorkspaceMountConfig {
  hostPath: string;
  containerPath: string;
  mode: 'ro' | 'rw';
  options?: string[];
}

export function buildContainerSecurityArgs(config: ContainerSecurityConfig): string[] {
  const args: string[] = [];

  if (config.memoryLimitMb !== undefined) {
    args.push(`--memory=${config.memoryLimitMb}m`);
  }

  if (config.cpuLimit !== undefined) {
    args.push(`--cpus=${config.cpuLimit}`);
  }

  if (config.pidsLimit !== undefined) {
    args.push(`--pids-limit=${config.pidsLimit}`);
  }

  if (config.readOnlyRoot !== false) {
    args.push('--read-only');
  }

  if (config.tmpfsSize !== undefined) {
    args.push(`--tmpfs=/tmp:rw,noexec,nosuid,size=${config.tmpfsSize}`);
  }

  if (config.dropAllCapabilities !== false) {
    args.push('--cap-drop=ALL');
  }

  if (config.noNewPrivileges !== false) {
    args.push('--security-opt=no-new-privileges');
  }

  return args;
}

export function buildWorkspaceMountArg(config: WorkspaceMountConfig): string[] {
  const opts: string[] = [
    `source=${config.hostPath}`,
    `target=${config.containerPath}`,
    config.mode === 'ro' ? 'readonly' : '',
    ...(config.options ?? []),
  ].filter(Boolean);

  debugLog(sandboxLog, 'workspace mount args', {
    hostPath: config.hostPath,
    containerPath: config.containerPath,
    mode: config.mode,
    options: opts.join(','),
  });

  return ['--mount', `type=bind,${opts.join(',')}`];
}

export function mergeContainerSecurityArgs(
  base: ContainerSecurityConfig,
  overrides: ContainerSecurityConfig,
): ContainerSecurityConfig {
  return { ...base, ...overrides };
}
