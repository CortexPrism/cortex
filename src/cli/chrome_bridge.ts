import { Command } from '@cliffy/command';
import { bold, cyan, green, red, yellow } from '@std/fmt/colors';
import { loadConfig } from '../config/config.ts';
import { globalRegistry } from '../tools/registry.ts';

export const chromeBridgeCommand = new Command()
  .name('chrome-bridge')
  .description('Manage chrome-bridge MCP server integration for real-browser automation')
  .action(async () => {
    console.log('');
    console.log(bold('Cortex Chrome Bridge'));
    console.log('');
    console.log(bold('Actions'));
    console.log(`  ${cyan('cortex chrome-bridge start')}  — Start chrome-bridge MCP server`);
    console.log(`  ${cyan('cortex chrome-bridge stop')}   — Stop chrome-bridge MCP server`);
    console.log(`  ${cyan('cortex chrome-bridge status')} — Check connection status`);
    console.log(`  ${cyan('cortex chrome-bridge tools')}  — List registered chrome-bridge tools`);
    console.log('');
  });

chromeBridgeCommand
  .command('start')
  .description('Start chrome-bridge MCP server')
  .action(async () => {
    const { startChromeBridge } = await import(
      '../tools/builtin/chrome_bridge_manager.ts'
    );
    const config = await loadConfig();
    if (!config.chromeBridge) {
      console.error(
        red('chrome-bridge not configured. Add a chromeBridge section to your config.'),
      );
      Deno.exit(1);
    }
    if (!config.chromeBridge.enabled) {
      console.log(yellow('chrome-bridge is disabled in config. Enable it first.'));
      return;
    }
    try {
      await startChromeBridge(config.chromeBridge);
      console.log(green('chrome-bridge started'));
    } catch (err) {
      console.error(red(`Failed to start chrome-bridge: ${(err as Error).message}`));
      Deno.exit(1);
    }
  });

chromeBridgeCommand
  .command('stop')
  .description('Stop chrome-bridge MCP server')
  .action(async () => {
    const { stopChromeBridge } = await import(
      '../tools/builtin/chrome_bridge_manager.ts'
    );
    await stopChromeBridge();
    console.log(green('chrome-bridge stopped'));
  });

chromeBridgeCommand
  .command('status')
  .description('Check chrome-bridge connection status')
  .action(async () => {
    const { isChromeBridgeRunning, startChromeBridge } = await import(
      '../tools/builtin/chrome_bridge_manager.ts'
    );
    const running = isChromeBridgeRunning();
    if (running) {
      console.log(green('chrome-bridge: running'));
    } else {
      console.log(yellow('chrome-bridge: not running'));
    }
  });

chromeBridgeCommand
  .command('tools')
  .description('List registered chrome-bridge tools')
  .action(async () => {
    const tools = globalRegistry.toolNames().filter((n) => n.startsWith('chrome_'));
    if (tools.length === 0) {
      console.log(yellow('No chrome-bridge tools registered. Start chrome-bridge first.'));
      return;
    }
    console.log(bold(`Registered chrome-bridge tools (${tools.length}):`));
    for (const t of tools) {
      console.log(`  ${cyan(t)}`);
    }
  });
