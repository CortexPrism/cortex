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
import { runMcpServerStdio } from './mcp/server.ts';
import { gitCommand } from './cli/git-cmd.ts';
import { githubCommand } from './cli/github-cmd.ts';
import { runValidator } from './processes/validator-process.ts';
import { runExecutor } from './processes/executor-process.ts';
import { runScheduler } from './processes/scheduler-process.ts';
import { runSupervisor } from './processes/supervisor-process.ts';

const subprocessIdx = Deno.args.findIndex((a) => a === '--subprocess');
if (subprocessIdx !== -1 && Deno.args[subprocessIdx + 1]) {
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
  .command('desktop', desktopCommand);

// Dynamically register plugin CLI commands
try {
  const { pluginManager } = await import('./plugins/manager.ts');
  const { buildCliffyCommand } = await import('./plugins/extensions/cli.ts');
  await pluginManager.loadAll();
  const activeCliCommands = pluginManager.getActiveCliCommands();
  for (const { pluginName, module, manifest } of activeCliCommands) {
    for (const cmdDecl of manifest.cliCommands ?? []) {
      try {
        const cmd = buildCliffyCommand(cmdDecl, module as Record<string, unknown>);
        program.command(cmdDecl.name, cmd);
      } catch (e) {
        console.error(`[plugins] Failed to register CLI command from ${pluginName}: ${(e as Error).message}`);
      }
    }
  }
} catch (e) {
  console.error(`[plugins] Failed to load plugin CLI commands: ${(e as Error).message}`);
}

await program.parse(Deno.args);
