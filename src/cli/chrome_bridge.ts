import { Command } from '@cliffy/command';
import { bold, cyan, green, red, yellow } from '@std/fmt/colors';
import { loadConfig } from '../config/config.ts';
import { globalRegistry } from '../tools/registry.ts';
import { i18n } from '../i18n/service.ts';

export const chromeBridgeCommand = new Command()
  .name('chrome-bridge')
  .description('Manage chrome-bridge MCP server integration for real-browser automation')
  .action(async () => {
    console.log('');
    console.log(bold('Cortex Chrome Bridge'));
    console.log('');
    console.log(bold(i18n.t('cli.chrome_bridge.actions')));
    console.log(`  ${cyan(i18n.t('cli.chrome_bridge.startCommand'))}`);
    console.log(`  ${cyan(i18n.t('cli.chrome_bridge.stopCommand'))}`);
    console.log(`  ${cyan(i18n.t('cli.chrome_bridge.statusCommand'))}`);
    console.log(`  ${cyan(i18n.t('cli.chrome_bridge.toolsCommand'))}`);
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
        red(i18n.t('cli.chrome_bridge.notConfigured')),
      );
      Deno.exit(1);
    }
    if (!config.chromeBridge.enabled) {
      console.log(yellow(i18n.t('cli.chrome_bridge.disabled')));
      return;
    }
    try {
      await startChromeBridge(config.chromeBridge);
      console.log(green(i18n.t('cli.chrome_bridge.started')));
    } catch (err) {
      console.error(
        red(i18n.t('cli.chrome_bridge.failedToStart', { message: (err as Error).message })),
      );
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
    console.log(green(i18n.t('cli.chrome_bridge.stopped')));
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
      console.log(green(i18n.t('cli.chrome_bridge.running')));
    } else {
      console.log(yellow(i18n.t('cli.chrome_bridge.notRunning')));
    }
  });

chromeBridgeCommand
  .command('tools')
  .description('List registered chrome-bridge tools')
  .action(async () => {
    const tools = globalRegistry.toolNames().filter((n) => n.startsWith('chrome_'));
    if (tools.length === 0) {
      console.log(yellow(i18n.t('cli.chrome_bridge.noTools')));
      return;
    }
    console.log(bold(i18n.t('cli.chrome_bridge.registeredTools', { count: String(tools.length) })));
    for (const t of tools) {
      console.log(`  ${cyan(t)}`);
    }
  });
