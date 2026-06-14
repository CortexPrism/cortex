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
import { importCommand } from './cli/import-cmd.ts';
import { agentCommand } from './cli/agent-cmd.ts';

const program = new Command()
  .name('cortex')
  .version('0.1.0')
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
  .command('import', importCommand)
  .command('agent', agentCommand);

await program.parse(Deno.args);
