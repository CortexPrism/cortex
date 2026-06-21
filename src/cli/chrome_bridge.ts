import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { bold, cyan, green, red, yellow } from '@std/fmt/colors';
import { globalRegistry } from '../tools/registry.ts';
import { i18n } from '../i18n/service.ts';

export const chromeBridgeCommand = cortexCommand('chrome-bridge')
  .description('Manage chrome-bridge MCP server integration for real-browser automation')
  .action(async (_opts: Record<string, unknown>, _ctx: Ctx) => {
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
  .command(
    'start',
    cortexCommand('start')
      .description('Start chrome-bridge MCP server')
      .needs('config')
      .action(async (_opts: Record<string, unknown>, ctx: Ctx) => {
        const { startChromeBridge } = await import(
          '../tools/builtin/chrome_bridge_manager.ts'
        );
        const config = ctx.config!;
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
      }),
  );

chromeBridgeCommand
  .command(
    'stop',
    cortexCommand('stop')
      .description('Stop chrome-bridge MCP server')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx) => {
        const { stopChromeBridge } = await import(
          '../tools/builtin/chrome_bridge_manager.ts'
        );
        await stopChromeBridge();
        console.log(green(i18n.t('cli.chrome_bridge.stopped')));
      }),
  );

chromeBridgeCommand
  .command(
    'status',
    cortexCommand('status')
      .description('Check chrome-bridge connection status')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx) => {
        const { isChromeBridgeRunning, startChromeBridge } = await import(
          '../tools/builtin/chrome_bridge_manager.ts'
        );
        const running = isChromeBridgeRunning();
        if (running) {
          console.log(green(i18n.t('cli.chrome_bridge.running')));
        } else {
          console.log(yellow(i18n.t('cli.chrome_bridge.notRunning')));
        }
      }),
  );

chromeBridgeCommand
  .command(
    'tools',
    cortexCommand('tools')
      .description('List registered chrome-bridge tools')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx) => {
        const tools = globalRegistry.toolNames().filter((n) => n.startsWith('chrome_'));
        if (tools.length === 0) {
          console.log(yellow(i18n.t('cli.chrome_bridge.noTools')));
          return;
        }
        console.log(
          bold(i18n.t('cli.chrome_bridge.registeredTools', { count: String(tools.length) })),
        );
        for (const t of tools) {
          console.log(`  ${cyan(t)}`);
        }
      }),
  );
