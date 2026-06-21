import { Command } from '@cliffy/command';

type AnyCommand = Command<
  // deno-lint-ignore no-explicit-any
  any,
  // deno-lint-ignore no-explicit-any
  any,
  // deno-lint-ignore no-explicit-any
  any,
  // deno-lint-ignore no-explicit-any
  any[],
  // deno-lint-ignore no-explicit-any
  any,
  // deno-lint-ignore no-explicit-any
  any,
  // deno-lint-ignore no-explicit-any
  any,
  // deno-lint-ignore no-explicit-any
  any
>;

export interface CommandEntry {
  path: string[];
  load: () => Promise<AnyCommand>;
  needs?: ('config' | 'migrations')[];
}

export const registry: CommandEntry[] = [
  {
    path: ['agent'],
    load: () => import('./agent-cmd.ts').then((m) => m.agentCommand._cmd),
    needs: ['config'],
  },
  {
    path: ['agent', 'chat'],
    load: () => import('./chat.ts').then((m) => m.chatCommand._cmd),
    needs: ['config', 'migrations'],
  },
  {
    path: ['agent', 'exec'],
    load: () => import('./agent-exec.ts').then((m) => m.execCommand._cmd),
    needs: ['config', 'migrations'],
  },
  {
    path: ['agent', 'tui'],
    load: () => import('./tui-cmd.ts').then((m) => m.tuiCommand._cmd),
    needs: ['config', 'migrations'],
  },
  {
    path: ['agent', 'sessions'],
    load: () => import('./sessions.ts').then((m) => m.sessionsCommand._cmd),
  },
  {
    path: ['agent', 'eval'],
    load: () => import('./eval-cmd.ts').then((m) => m.evalCmd._cmd),
  },
  {
    path: ['agent', 'reflect'],
    load: () => import('./reflect.ts').then((m) => m.reflectCommand._cmd),
    needs: ['config', 'migrations'],
  },
  {
    path: ['agent', 'lint'],
    load: () => import('./agentlint-cmd.ts').then((m) => m.agentlintCommand._cmd),
  },
  {
    path: ['agent', 'import'],
    load: () => import('./import-cmd.ts').then((m) => m.importCommand._cmd),
    needs: ['config'],
  },
  {
    path: ['agent', 'voice'],
    load: () => import('./voice-cmd.ts').then((m) => m.voiceCommand._cmd),
  },
  {
    path: ['server'],
    load: () => import('./server-cmd.ts').then((m) => m.serverCommand._cmd),
  },
  {
    path: ['sandbox'],
    load: () => import('./sandbox-cmd.ts').then((m) => m.sandboxCommand._cmd),
  },
  {
    path: ['self'],
    load: () => import('./self-cmd.ts').then((m) => m.selfCommand._cmd),
  },
  {
    path: ['db'],
    load: () => import('./db-cmd.ts').then((m) => m.dbCommand._cmd),
  },
  {
    path: ['daemon'],
    load: () => import('./daemon.ts').then((m) => m.daemonCommand._cmd),
  },
  {
    path: ['service', 'install'],
    load: () => import('./install.ts').then((m) => m.installCommand._cmd),
  },
  {
    path: ['service', 'uninstall'],
    load: () => import('./install.ts').then((m) => m.uninstallCommand._cmd),
  },
  {
    path: ['setup'],
    load: () => import('./setup-cmd.ts').then((m) => m.setupCommand._cmd),
  },
  {
    path: ['config'],
    load: () => import('./config-cmd.ts').then((m) => m.configCommand._cmd),
  },
  {
    path: ['memory'],
    load: () => import('./memory-cmd.ts').then((m) => m.memoryCommand._cmd),
  },
  {
    path: ['vault'],
    load: () => import('./vault-cmd.ts').then((m) => m.vaultCommand._cmd),
  },
  {
    path: ['policy'],
    load: () => import('./policy-cmd.ts').then((m) => m.policyCommand._cmd),
  },
  {
    path: ['soul'],
    load: () => import('./soul-cmd.ts').then((m) => m.soulCommand._cmd),
  },
  {
    path: ['plugins'],
    load: () => import('./plugins-cmd.ts').then((m) => m.pluginsCommand._cmd),
  },
  {
    path: ['marketplace'],
    load: () => import('./marketplace-cmd.ts').then((m) => m.marketplaceCommand._cmd),
  },
  {
    path: ['models'],
    load: () => import('./models-cmd.ts').then((m) => m.modelsCommand._cmd),
  },
  {
    path: ['jobs'],
    load: () => import('./jobs.ts').then((m) => m.jobsCommand._cmd),
  },
  {
    path: ['git'],
    load: () => import('./git-cmd.ts').then((m) => m.gitCommand._cmd),
  },
  {
    path: ['github'],
    load: () => import('./github-cmd.ts').then((m) => m.githubCommand._cmd),
  },
  {
    path: ['channels'],
    load: () => import('./channels-cmd.ts').then((m) => m.channelsCommand._cmd),
  },
  {
    path: ['mcp'],
    load: () => import('./mcp-cmd.ts').then((m) => m.mcpCommand._cmd),
  },
  {
    path: ['mcp', 'chrome'],
    load: () => import('./chrome_bridge.ts').then((m) => m.chromeBridgeCommand._cmd),
  },
  {
    path: ['mcp', 'a2a'],
    load: () => import('./a2a-cmd.ts').then((m) => m.a2aCommand._cmd),
  },
  {
    path: ['mcp', 'gateway'],
    load: () => import('./mcp-gateway-cmd.ts').then((m) => m.mcpGatewayCommand._cmd),
  },
  {
    path: ['node'],
    load: () => import('./node.ts').then((m) => m.nodeCommand._cmd),
  },
  {
    path: ['hooks'],
    load: () => import('./hooks-cmd.ts').then((m) => m.hooksCommand._cmd),
  },
  {
    path: ['triggers'],
    load: () => import('./triggers-cmd.ts').then((m) => m.triggersCommand._cmd),
  },
  {
    path: ['workflow'],
    load: () => import('./workflow-cmd.ts').then((m) => m.workflowCommand._cmd),
  },
  {
    path: ['projects'],
    load: () => import('./projects-cmd.ts').then((m) => m.projectsCommand._cmd),
  },
  {
    path: ['desktop'],
    load: () => import('./desktop-cmd.ts').then((m) => m.desktopCommand._cmd),
  },
  {
    path: ['log'],
    load: () => import('./log-cmd.ts').then((m) => m.logCommand._cmd),
  },
  {
    path: ['compliance'],
    load: () => import('./compliance-cmd.ts').then((m) => m.complianceCommand._cmd),
  },
  {
    path: ['debug'],
    load: () => import('./debug-cmd.ts').then((m) => m.debugCmd._cmd),
  },
  {
    path: ['memori'],
    load: () => import('./memori-cmd.ts').then((m) => m.memoriCommand._cmd),
  },
];
