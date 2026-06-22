export {
  formatSandboxResult,
  getAvailableRuntime,
  getDockerNotAvailableMessage,
  isDockerAvailable,
  isGVisorAvailable,
  runInSandbox,
  type SandboxOptions,
  type SandboxResult,
  type SandboxRuntime,
} from './executor.ts';

export {
  type AgentSandboxOptions,
  buildGVisorCommand,
  buildSandboxCommand,
} from './agent-sandbox.ts';

export {
  type ContainerSecurityConfig,
  type WorkspaceMountConfig,
  buildContainerSecurityArgs,
  buildWorkspaceMountArg,
  mergeContainerSecurityArgs,
} from './security-args.ts';

export {
  generateDevEnvManifest,
  listDevEnvManifests,
  loadDevEnvManifest,
  saveDevEnvManifest,
  validateDevEnvManifest,
} from './dev-env-code.ts';

export {
  captureEnvironmentSnapshot,
  compareSnapshots,
  deleteEnvironmentSnapshot,
  getEnvironmentSnapshot,
  listEnvironmentSnapshots,
  maskSensitiveEnv,
  replicateEnvironment,
} from './replication.ts';

export {
  captureWorkspaceSnapshot,
  deleteWorkspaceSnapshot,
  diffWorkspaceSnapshots,
  getWorkspaceSnapshot,
  listWorkspaceSnapshots,
  restoreWorkspaceSnapshot,
} from './workspace-snapshot.ts';

export { detectDependencies } from './dependency-detect.ts';

export { captureGitState } from './git-capture.ts';

export { autofix, type AutofixOptions, type AutofixResult } from './autofix.ts';

export {
  createBugRepro,
  deleteBugRepro,
  executeBugRepro,
  getBugRepro,
  listBugRepros,
} from './bug-repro.ts';

export {
  SandboxEnvironment,
  type SandboxEnvironmentOptions,
  type SandboxEnvironmentSetupResult,
} from './environment.ts';

export {
  autofixLog,
  bugReproLog,
  depsLog,
  devEnvLog,
  envLog,
  execLog,
  getLogLevel,
  gitLog,
  isSandboxDebug,
  type PathValidationResult,
  provisionLog,
  sandboxLog,
  setSandboxDebug,
  snapshotLog,
  toggleSandboxDebug,
  validateSandboxPath,
  workspaceLog,
} from './logger.ts';

export type {
  BugReproRun,
  DependencyManifest,
  DevEnvManifest,
  EnvironmentSnapshot,
  FileTreeEntry,
  GitSnapshot,
  SandboxSnapshotConfig,
  ToolStateEntry,
  WorkspaceSnapshot,
} from './snapshot-types.ts';
