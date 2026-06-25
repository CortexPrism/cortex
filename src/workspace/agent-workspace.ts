import { ensureDir } from '@std/fs';
import { join, relative } from '@std/path';
import { getAgentWorkspaceDir, resolveWorkspacePath } from './paths.ts';
import { isDockerAvailable, isGVisorAvailable } from '../../packages/gate/src/sandbox/agent-sandbox.ts';
import { buildContainerSecurityArgs, buildWorkspaceMountArg } from '../../packages/gate/src/sandbox/security-args.ts';
import { logger } from '../utils/logger.ts';

const _log = logger('workspace:agent');

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

export interface DirEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
}

export interface FileStat {
  isFile: boolean;
  isDirectory: boolean;
  size: number;
  mtime: Date | null;
}

export interface AgentWorkspace {
  readonly agentId: string;
  readonly workspaceDir: string;
  readonly type: 'host' | 'container';

  /** Resolve a raw path within the workspace boundary. Throws if outside. */
  resolvePath(rawPath: string, workspace?: 'agent' | 'global'): string;

  /** Execute a shell command within the workspace. */
  exec(command: string, opts?: {
    cwd?: string;
    timeoutMs?: number;
    env?: Record<string, string>;
  }): Promise<ExecResult>;

  /** Read a text file within the workspace. */
  readFile(hostPath: string): Promise<string>;

  /** Write content to a file within the workspace. Creates parent dirs. */
  writeFile(hostPath: string, content: string): Promise<void>;

  /** Read raw bytes from a file within the workspace. */
  readFileRaw(hostPath: string): Promise<Uint8Array>;

  /** Stat a file/directory within the workspace. */
  stat(hostPath: string): Promise<FileStat>;

  /** List directory entries within the workspace. */
  readDir(hostPath: string): Promise<DirEntry[]>;

  /** Create a directory within the workspace. */
  mkdir(hostPath: string, recursive?: boolean): Promise<void>;

  /** Remove a file or directory within the workspace. */
  remove(hostPath: string, recursive?: boolean): Promise<void>;

  /** Initialize the workspace (create dirs, start container). */
  init(): Promise<void>;

  /** Tear down the workspace (stop container, clean up). */
  destroy(): Promise<void>;
}

function shellEscape(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

function toContainerPath(workspaceDir: string, hostPath: string): string {
  const rel = relative(workspaceDir, hostPath);
  return '/workspace/' + rel;
}

export class HostWorkspace implements AgentWorkspace {
  readonly type = 'host' as const;
  readonly workspaceDir: string;

  constructor(readonly agentId: string) {
    this.workspaceDir = getAgentWorkspaceDir(agentId);
  }

  resolvePath(rawPath: string, workspace?: 'agent' | 'global'): string {
    return resolveWorkspacePath(this.agentId, rawPath, workspace ?? 'agent');
  }

  async exec(command: string, opts?: {
    cwd?: string;
    timeoutMs?: number;
    env?: Record<string, string>;
  }): Promise<ExecResult> {
    const cwd = opts?.cwd ?? this.workspaceDir;
    const timeout = opts?.timeoutMs ?? 30_000;
    const env = { ...opts?.env };

    const proc = new Deno.Command('sh', {
      args: ['-c', command],
      cwd,
      env,
      stdout: 'piped',
      stderr: 'piped',
    });

    const child = proc.spawn();
    let timedOut = false;

    const timer = setTimeout(() => {
      try {
        child.kill('SIGTERM');
        setTimeout(() => {
          try { child.kill('SIGKILL'); } catch { /* gone */ }
        }, 2000);
      } catch { /* already exited */ }
    }, timeout);

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

  async readFile(hostPath: string): Promise<string> {
    return await Deno.readTextFile(hostPath);
  }

  async writeFile(hostPath: string, content: string): Promise<void> {
    const dir = hostPath.split('/').slice(0, -1).join('/');
    if (dir) await ensureDir(dir);
    await Deno.writeTextFile(hostPath, content);
  }

  async readFileRaw(hostPath: string): Promise<Uint8Array> {
    return await Deno.readFile(hostPath);
  }

  async stat(hostPath: string): Promise<FileStat> {
    const s = await Deno.stat(hostPath);
    return { isFile: s.isFile, isDirectory: s.isDirectory, size: s.size, mtime: s.mtime ?? null };
  }

  async readDir(hostPath: string): Promise<DirEntry[]> {
    const entries: DirEntry[] = [];
    for await (const e of Deno.readDir(hostPath)) {
      entries.push({ name: e.name, isFile: e.isFile, isDirectory: e.isDirectory });
    }
    return entries;
  }

  async mkdir(hostPath: string, recursive = false): Promise<void> {
    await Deno.mkdir(hostPath, { recursive });
  }

  async remove(hostPath: string, recursive = false): Promise<void> {
    await Deno.remove(hostPath, { recursive });
  }

  async init(): Promise<void> {
    await ensureDir(this.workspaceDir);
    try {
      await Deno.stat(join(this.workspaceDir, '.git'));
    } catch {
      const cmd = new Deno.Command('git', {
        args: ['-C', this.workspaceDir, 'init'],
        stdout: 'null',
        stderr: 'null',
      });
      await cmd.output();
    }
  }

  async destroy(): Promise<void> {
    // Host workspace: no teardown needed
  }
}

export class ContainerWorkspace implements AgentWorkspace {
  readonly type = 'container' as const;
  readonly workspaceDir: string;
  private _containerName: string;
  private _containerId: string | null = null;
  private _destroyed = false;
  private _networkMode: 'none' | 'bridge';
  private _image: string;

  constructor(readonly agentId: string, opts?: {
    networkMode?: 'none' | 'bridge';
    image?: string;
  }) {
    this.workspaceDir = getAgentWorkspaceDir(agentId);
    this._containerName = `cortex-ws-${agentId}-${Math.random().toString(36).slice(2, 7)}`;
    this._networkMode = opts?.networkMode ?? 'none';
    this._image = opts?.image ?? 'alpine:3.20';
  }

  get containerId(): string | null { return this._containerId; }
  get containerName(): string { return this._containerName; }

  resolvePath(rawPath: string, workspace?: 'agent' | 'global'): string {
    return resolveWorkspacePath(this.agentId, rawPath, workspace ?? 'agent');
  }

  private async _dockerExec(command: string, timeoutMs = 30_000, env?: Record<string, string>): Promise<ExecResult> {
    if (this._destroyed) {
      return { stdout: '', stderr: 'Container has been destroyed', exitCode: -1, timedOut: false };
    }
    const args: string[] = ['exec'];
    if (env) for (const [k, v] of Object.entries(env)) args.push('-e', `${k}=${v}`);
    args.push(this._containerName, 'sh', '-c', command);

    const proc = new Deno.Command('docker', { args, stdout: 'piped', stderr: 'piped' });
    const child = proc.spawn();
    let timedOut = false;
    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, 2000); } catch { /* gone */ }
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

  async exec(command: string, opts?: {
    cwd?: string;
    timeoutMs?: number;
    env?: Record<string, string>;
  }): Promise<ExecResult> {
    const cwd = opts?.cwd ?? '/workspace';
    const fullCmd = `cd ${shellEscape(cwd)} && ${command}`;
    return await this._dockerExec(fullCmd, opts?.timeoutMs, opts?.env);
  }

  async readFile(hostPath: string): Promise<string> {
    const cp = toContainerPath(this.workspaceDir, hostPath);
    const r = await this._dockerExec(`cat ${shellEscape(cp)}`);
    if (r.exitCode !== 0) throw new Error(`readFile failed: ${r.stderr}`);
    return r.stdout;
  }

  async writeFile(hostPath: string, content: string): Promise<void> {
    const cp = toContainerPath(this.workspaceDir, hostPath);
    const dir = cp.split('/').slice(0, -1).join('/');
    await this._dockerExec(`mkdir -p ${shellEscape(dir)}`);
    // Use base64 to avoid shell escaping issues with arbitrary content
    const b64 = btoa(content);
    const r = await this._dockerExec(`echo ${shellEscape(b64)} | base64 -d > ${shellEscape(cp)}`);
    if (r.exitCode !== 0) throw new Error(`writeFile failed: ${r.stderr}`);
  }

  async readFileRaw(hostPath: string): Promise<Uint8Array> {
    const cp = toContainerPath(this.workspaceDir, hostPath);
    const r = await this._dockerExec(`base64 ${shellEscape(cp)}`);
    if (r.exitCode !== 0) throw new Error(`readFileRaw failed: ${r.stderr}`);
    const binary = atob(r.stdout.trim());
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  }

  async stat(hostPath: string): Promise<FileStat> {
    const cp = toContainerPath(this.workspaceDir, hostPath);
    const r = await this._dockerExec(`stat -c '%F %s %Y' ${shellEscape(cp)} 2>/dev/null || echo 'missing'`);
    const out = r.stdout.trim();
    if (out === 'missing') throw new Error(`stat failed: path not found`);
    // stat output: "regular file 1234 1719770000" or "directory 4096 1719770000"
    const parts = out.split(' ');
    const isDir = parts[0] === 'directory';
    const size = parseInt(parts[1]) || 0;
    const mtime = parts[2] ? new Date(parseInt(parts[2]) * 1000) : null;
    return { isFile: !isDir && parts[0] !== 'missing', isDirectory: isDir, size, mtime };
  }

  async readDir(hostPath: string): Promise<DirEntry[]> {
    const cp = toContainerPath(this.workspaceDir, hostPath);
    // Use ls -1p: directories end with /, files don't
    const r = await this._dockerExec(`ls -1pA ${shellEscape(cp)} 2>/dev/null`);
    if (r.exitCode !== 0 || r.stdout.trim() === '') return [];
    return r.stdout.trim().split('\n').filter(Boolean).map((line) => {
      const isDir = line.endsWith('/');
      return { name: isDir ? line.slice(0, -1) : line, isFile: !isDir, isDirectory: isDir };
    });
  }

  async mkdir(hostPath: string, recursive = false): Promise<void> {
    const cp = toContainerPath(this.workspaceDir, hostPath);
    const flag = recursive ? '-p' : '';
    const r = await this._dockerExec(`mkdir ${flag} ${shellEscape(cp)}`);
    if (r.exitCode !== 0) throw new Error(`mkdir failed: ${r.stderr}`);
  }

  async remove(hostPath: string, recursive = false): Promise<void> {
    const cp = toContainerPath(this.workspaceDir, hostPath);
    const flag = recursive ? '-rf' : '-f';
    const r = await this._dockerExec(`rm ${flag} ${shellEscape(cp)}`);
    if (r.exitCode !== 0) throw new Error(`remove failed: ${r.stderr}`);
  }

  async init(): Promise<void> {
    await ensureDir(this.workspaceDir);

    try {
      await Deno.stat(join(this.workspaceDir, '.git'));
    } catch {
      const cmd = new Deno.Command('git', {
        args: ['-C', this.workspaceDir, 'init'],
        stdout: 'null',
        stderr: 'null',
      });
      await cmd.output();
    }

    const dockerAvailable = await isDockerAvailable();
    if (!dockerAvailable) {
      _log.warn('Docker not available, falling back to host workspace', { agentId: this.agentId });
      return;
    }

    try {
      await new Deno.Command('docker', {
        args: ['rm', '-f', this._containerName],
        stdout: 'null',
        stderr: 'null',
      }).output();
    } catch { /* container didn't exist */ }

    const gvisorAvailable = await isGVisorAvailable();
    const runtime = gvisorAvailable ? 'gvisor' : 'docker';

    const securityArgs = buildContainerSecurityArgs({
      memoryLimitMb: 512,
      cpuLimit: 1.0,
      pidsLimit: 128,
      readOnlyRoot: true,
      tmpfsSize: '256M',
      dropAllCapabilities: true,
      noNewPrivileges: true,
    });

    const mountArgs = buildWorkspaceMountArg({
      hostPath: this.workspaceDir,
      containerPath: '/workspace',
      mode: 'rw',
    });

    const dockerArgs: string[] = [
      'run', '-d',
      '--name', this._containerName,
      '--network', this._networkMode,
      ...securityArgs,
      ...mountArgs,
      '-w', '/workspace',
    ];

    if (runtime === 'gvisor') dockerArgs.push('--runtime=runsc');

    dockerArgs.push(this._image, 'sh', '-c', 'while true; do sleep 3600; done');

    const proc = new Deno.Command('docker', {
      args: dockerArgs,
      stdout: 'piped',
      stderr: 'piped',
    });

    const { code, stdout, stderr } = await proc.output();
    if (code !== 0) {
      const errMsg = new TextDecoder().decode(stderr);
      _log.error(`Failed to start container ${this._containerName}`, { exitCode: code, stderr: errMsg });
      throw new Error(`Failed to start container: ${errMsg}`);
    }

    this._containerId = new TextDecoder().decode(stdout).trim();
    _log.info('Container workspace started', {
      agentId: this.agentId,
      containerId: this._containerId.slice(0, 12),
      runtime,
    });
  }

  async destroy(): Promise<void> {
    if (this._destroyed) return;
    this._destroyed = true;

    try {
      await new Deno.Command('docker', {
        args: ['rm', '-f', this._containerName],
        stdout: 'null',
        stderr: 'null',
      }).output();
      _log.info('Container workspace destroyed', { agentId: this.agentId });
    } catch {
      _log.debug('Container already removed', { agentId: this.agentId });
    }
  }
}

/** Detect whether container-based workspace isolation is available. */
export async function isContainerIsolationAvailable(): Promise<boolean> {
  return await isDockerAvailable();
}

const _activeWorkspaces = new Map<string, AgentWorkspace>();

/** Get or create an agent workspace, reused across turns within a session. */
export async function getOrCreateWorkspace(agentId: string): Promise<AgentWorkspace> {
  const existing = _activeWorkspaces.get(agentId);
  if (existing) return existing;

  const ws = await getWorkspaceFactory().create(agentId);
  await ws.init();
  _activeWorkspaces.set(agentId, ws);
  return ws;
}

/** Destroy and remove an agent workspace. Safe to call multiple times. */
export async function destroyWorkspace(agentId: string): Promise<void> {
  const ws = _activeWorkspaces.get(agentId);
  if (!ws) return;
  _activeWorkspaces.delete(agentId);
  await ws.destroy();
}

/** Destroy all active workspaces (for shutdown). */
export async function destroyAllWorkspaces(): Promise<void> {
  const ids = [..._activeWorkspaces.keys()];
  await Promise.all(ids.map((id) => destroyWorkspace(id)));
}

let _workspaceFactory: WorkspaceFactory | null = null;

export interface WorkspaceFactory {
  create(agentId: string): Promise<AgentWorkspace>;
}

class DefaultWorkspaceFactory implements WorkspaceFactory {
  async create(agentId: string): Promise<AgentWorkspace> {
    if (await isContainerIsolationAvailable()) {
      return new ContainerWorkspace(agentId);
    }
    return new HostWorkspace(agentId);
  }
}

export function getWorkspaceFactory(): WorkspaceFactory {
  if (!_workspaceFactory) {
    _workspaceFactory = new DefaultWorkspaceFactory();
  }
  return _workspaceFactory;
}

export function setWorkspaceFactory(factory: WorkspaceFactory): void {
  _workspaceFactory = factory;
}
