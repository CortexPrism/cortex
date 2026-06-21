import { Command } from '@cliffy/command';
import { getVersion } from './config/version.ts';
import { runValidator } from './processes/validator-process.ts';
import { runExecutor } from './processes/executor-process.ts';
import { runScheduler } from './processes/scheduler-process.ts';
import { runSupervisor } from './processes/supervisor-process.ts';
import { runMcpServerStdio } from './mcp/server.ts';
import { i18n } from './i18n/service.ts';
import { PATHS } from './config/paths.ts';
import { registry } from './cli/registry.ts';
import { mergePluginCommands, registerCommand } from './cli/registry-helpers.ts';

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
  .description('CortexPrism — AI agent operating system')
  .globalOption('--json', 'Machine-readable JSON output')
  .globalOption('-v, --verbose', 'Enable verbose debug logging')
  .globalOption('--no-color', 'Disable ANSI color output')
  .globalOption('--config <path:string>', 'Override config file path')
  .globalOption('-m, --model <model:string>', 'Override default model')
  .globalOption('--profile <name:string>', 'Config profile to use');

for (const entry of registry) {
  try {
    const cmd = await entry.load();
    // deno-lint-ignore no-explicit-any
    registerCommand(program as any, entry.path, cmd as any);
  } catch (e) {
    console.error(`Failed to load command ${entry.path.join(' ')}: ${(e as Error).message}`);
  }
}

// Backward-compat aliases for renamed commands
const aliases: Record<string, string[]> = {
  'chat': ['agent', 'chat'],
  'tui': ['agent', 'tui'],
  'serve': ['server', 'start'],
  'restart': ['server', 'restart'],
  'start': ['server', 'start'],
  'stop': ['server', 'stop'],
};
for (const [alias, target] of Object.entries(aliases)) {
  const aliasCmd = new Command()
    .name(alias)
    .description(`Alias for '${target.join(' ')}' (deprecated)`)
    .action(async () => {
      console.error(
        `Warning: 'cortex ${alias}' is deprecated. Use 'cortex ${target.join(' ')}' instead.`,
      );
      const extraArgs = Deno.args.slice(Deno.args.indexOf(alias) + 1);
      const args = [...target, ...extraArgs];
      await program.parse(args);
    });
  // deno-lint-ignore no-explicit-any
  (program as any).command(alias, aliasCmd);
}

// deno-lint-ignore no-explicit-any
await mergePluginCommands(program as any);

const localesDir = `${PATHS.projectRoot}/locales`;
try {
  const { loadConfig } = await import('./config/config.ts');
  const cfg = await loadConfig();
  await i18n.init(cfg.locale, localesDir);
} catch {
  await i18n.init('en', localesDir);
}

await program.parse(Deno.args);
