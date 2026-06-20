import type { SandboxRuntime } from './executor.ts';

export interface EnvironmentSnapshot {
  id: string;
  name: string;
  sessionId: string;
  agentId: string;
  createdAt: string;
  runtime: SandboxRuntime;
  env: Record<string, string>;
  dependencies: DependencyManifest;
  gitState: GitSnapshot;
  sandboxConfig: SandboxSnapshotConfig;
  workspacePath: string;
  tags: string[];
}

export interface DependencyManifest {
  language: string;
  packages: Record<string, string>;
  lockFileExists: boolean;
  managerHint: string;
}

export interface GitSnapshot {
  branch: string;
  headCommit: string;
  dirty: boolean;
  changedFiles: string[];
  untrackedFiles: string[];
}

export interface SandboxSnapshotConfig {
  runtime: SandboxRuntime;
  timeoutMs: number;
  memoryLimitMb: number;
  cpuLimit: number;
  networkMode: 'none' | 'restricted' | 'full';
}

export interface WorkspaceSnapshot {
  id: string;
  name: string;
  sessionId: string;
  agentId: string;
  createdAt: string;
  fileTree: FileTreeEntry[];
  gitState: GitSnapshot;
  memoryContext: string[];
  toolState: ToolStateEntry[];
  tags: string[];
}

export interface FileTreeEntry {
  path: string;
  size: number;
  modifiedAt: string;
  hash: string;
  content?: string;
}

export interface ToolStateEntry {
  toolName: string;
  status: 'idle' | 'running' | 'complete' | 'error';
  args?: Record<string, unknown>;
  result?: string;
}

export interface DevEnvManifest {
  name: string;
  version: string;
  description: string;
  sandbox: {
    runtime: SandboxRuntime;
    timeoutMs: number;
    memoryLimitMb: number;
    cpuLimit: number;
    networkMode: 'none' | 'restricted' | 'full';
  };
  environment: Record<string, string>;
  dependencies: {
    language: string;
    manager: string;
    packages: Record<string, string>;
  };
  workspace: {
    requiredFiles: string[];
    ignorePatterns: string[];
    setupCommands: string[];
  };
  meta: {
    createdAt: string;
    updatedAt: string;
    source: 'generated' | 'manual';
  };
}

export interface BugReproRun {
  id: string;
  issueTitle: string;
  issueDescription: string;
  language: string;
  code: string;
  testCode: string;
  runtime: SandboxRuntime;
  status: 'queued' | 'running' | 'passed' | 'failed' | 'error';
  result?: {
    stdout: string;
    stderr: string;
    exitCode: number;
    durationMs: number;
    passed: boolean;
  };
  fixedCode?: string;
  rounds: number;
  createdAt: string;
  sessionId: string;
  tags: string[];
}
