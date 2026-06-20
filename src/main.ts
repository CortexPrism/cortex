import { Command } from '@cliffy/command';
import { chatCommand } from './cli/chat.ts';
import { migrateCommand } from './cli/migrate.ts';
import { sessionsCommand } from './cli/sessions.ts';
import { setupCommand } from './cli/setup-cmd.ts';
import { jobsCommand } from './cli/jobs.ts';
import { memoryCommand } from './cli/memory-cmd.ts';
import { runCommand } from './cli/run.ts';
import { serveCommand } from './cli/serve.ts';
import { reflectCommand } from './cli/reflect.ts';
import { vaultCommand } from './cli/vault-cmd.ts';
import { policyCommand } from './cli/policy-cmd.ts';
import { daemonCommand } from './cli/daemon.ts';
import { soulCommand } from './cli/soul-cmd.ts';
import { discordCommand } from './cli/discord-cmd.ts';
import { pluginsCommand } from './cli/plugins-cmd.ts';
import { marketplaceCommand } from './cli/marketplace-cmd.ts';
import { importCommand } from './cli/import-cmd.ts';
import { agentCommand } from './cli/agent-cmd.ts';
import { serviceCommand } from './cli/service-cmd.ts';
import { stopCommand } from './cli/stop.ts';
import { updateCommand } from './cli/update-cmd.ts';
import { getVersion } from './config/version.ts';
import { hooksCommand } from './cli/hooks-cmd.ts';
import { triggersCommand } from './cli/triggers-cmd.ts';
import { channelsCommand } from './cli/channels-cmd.ts';
import { mcpCommand } from './cli/mcp-cmd.ts';
import { remoteCommand } from './cli/remote-cmd.ts';
import { tuiCommand } from './cli/tui-cmd.ts';
import { projectsCommand } from './cli/projects-cmd.ts';
import { workflowCommand } from './cli/workflow-cmd.ts';
import { desktopCommand } from './cli/desktop-cmd.ts';
import { nodeCommand } from './cli/node.ts';
import { evalCmd as evalCommand } from './cli/eval-cmd.ts';
import { modelsCommand } from './cli/models-cmd.ts';
import { runMcpServerStdio } from './mcp/server.ts';
import { gitCommand } from './cli/git-cmd.ts';
import { githubCommand } from './cli/github-cmd.ts';
import { quartermasterCommand } from './cli/quartermaster-cmd.ts';
import { mqmCommand } from './cli/model-qm-cmd.ts';
import { installCommand, uninstallCommand } from './cli/install.ts';
import { restartCommand, startCommand } from './cli/start.ts';
import { voiceCommand } from './cli/voice-cmd.ts';
import { logCommand } from './cli/log-cmd.ts';
import { chromeBridgeCommand } from './cli/chrome_bridge.ts';
import { a2aCommand } from './cli/a2a-cmd.ts';
import { memoriCommand } from './cli/memori-cmd.ts';
import { agentlintCommand } from './cli/agentlint-cmd.ts';
import { mcpGatewayCommand } from './cli/mcp-gateway-cmd.ts';
import { complianceCommand } from './cli/compliance-cmd.ts';
import { debugCmd } from './cli/debug-cmd.ts';
import { runValidator } from './processes/validator-process.ts';
import { runExecutor } from './processes/executor-process.ts';
import { runScheduler } from './processes/scheduler-process.ts';
import { runSupervisor } from './processes/supervisor-process.ts';
import { i18n } from './i18n/service.ts';
import { PATHS } from './config/paths.ts';

const subprocessIdx = Deno.args.findIndex((a) => a === '--subprocess');
if (subprocessIdx !== -1 && Deno.args[subprocessIdx + 1]) {
  const localesDir = PATHS.localesDir;
  await i18n.init('en', localesDir);
  const role = Deno.args[subprocessIdx + 1];
  switch (role) {
    case 'validator':
      await runValidator();
      Deno.exit(0);
      break;
    case 'executor':
      await runExecutor();
      Deno.exit(0);
      break;
    case 'scheduler':
      await runScheduler();
      Deno.exit(0);
      break;
    case 'supervisor':
      await runSupervisor();
      Deno.exit(0);
      break;
    case 'mcp-stdio':
      await runMcpServerStdio();
      Deno.exit(0);
      break;
    default:
      console.error(`Unknown subprocess: ${role}`);
      Deno.exit(1);
  }
}

const version = await getVersion();

const program = new Command()
  .name('cortex')
  .version(version)
  .description('CortexPrism — agentic harness system')
  .command('chat', chatCommand)
  .command('setup', setupCommand)
  .command('sessions', sessionsCommand)
  .command('jobs', jobsCommand)
  .command('memory', memoryCommand)
  .command('run', runCommand)
  .command('serve', serveCommand)
  .command('reflect', reflectCommand)
  .command('vault', vaultCommand)
  .command('policy', policyCommand)
  .command('migrate', migrateCommand)
  .command('daemon', daemonCommand)
  .command('soul', soulCommand)
  .command('discord', discordCommand)
  .command('plugins', pluginsCommand)
  .command('marketplace', marketplaceCommand)
  .command('import', importCommand)
  .command('agent', agentCommand)
  .command('service', serviceCommand)
  .command('stop', stopCommand)
  .command('update', updateCommand)
  .command('git', gitCommand)
  .command('github', githubCommand)
  .command('hooks', hooksCommand)
  .command('triggers', triggersCommand)
  .command('channels', channelsCommand)
  .command('mcp', mcpCommand)
  .command('remote', remoteCommand)
  .command('tui', tuiCommand)
  .command('projects', projectsCommand)
  .command('workflow', workflowCommand)
  .command('desktop', desktopCommand)
  .command('node', nodeCommand)
  .command('eval', evalCommand)
  .command('models', modelsCommand)
  .command('qm', quartermasterCommand)
  .command('mqm', mqmCommand)
  .command('install', installCommand)
  .command('uninstall', uninstallCommand)
  .command('start', startCommand)
  .command('restart', restartCommand)
  .command('voice', voiceCommand)
  .command('log', logCommand)
  .command('chrome-bridge', chromeBridgeCommand)
  .command('a2a', a2aCommand)
  .command('memori', memoriCommand)
  .command('agentlint', agentlintCommand)
  .command('mcp-gateway', mcpGatewayCommand)
  .command('compliance', complianceCommand)
  .command('debug', debugCmd);

const localesDir = `${PATHS.projectRoot}/locales`;
try {
  const { loadConfig } = await import('./config/config.ts');
  const cfg = await loadConfig();
  await i18n.init(cfg.locale, localesDir);
} catch {
  await i18n.init('en', localesDir);
}

await program.parse(Deno.args);
