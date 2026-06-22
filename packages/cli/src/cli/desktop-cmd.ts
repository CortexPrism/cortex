import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { executeDesktopAction, getDockerfile, getEntrypointScript } from '../../../../src/desktop/automation.ts';
import { dim, green } from '@std/fmt/colors';
import { getTempDir } from '../../../../src/utils/platform.ts';
import { join } from '@std/path';
import { i18n } from '../../../../src/i18n/service.ts';

const dockerfileCmd = cortexCommand('dockerfile')
  .description('Print the XFCE+noVNC Dockerfile')
  .action(async () => {
    console.log(getDockerfile());
  });

const entrypointCmd = cortexCommand('entrypoint')
  .description('Print the container entrypoint script')
  .action(async () => {
    console.log(getEntrypointScript());
  });

const screenshotCmd = cortexCommand('screenshot')
  .description('Take a screenshot via scrot')
  .action(async () => {
    const result = await executeDesktopAction({ action: 'screenshot', format: 'png' });
    if (result.success && result.screenshot) {
      const path = join(getTempDir(), `cortex-screenshot-${Date.now()}.png`);
      await Deno.writeFile(path, result.screenshot);
      console.log(
        green(i18n.t('cli.desktop.screenshotSaved', { path, duration: String(result.durationMs) })),
      );
    } else {
      console.error(i18n.t('cli.desktop.screenshotFailed', { error: result.error ?? 'unknown' }));
    }
  });

const clickCmd = cortexCommand('click')
  .arguments('<x:number> <y:number>')
  .description('Click at coordinates')
  .action(async (_opts: Record<string, unknown>, _ctx: Ctx, x: string, y: string) => {
    const result = await executeDesktopAction({ action: 'click', x: Number(x), y: Number(y) });
    console.log(
      result.success
        ? green(i18n.t('cli.desktop.clicked', { x, y }))
        : i18n.t('cli.desktop.clickFailed', { error: result.error ?? 'unknown' }),
    );
  });

const typeCmd = cortexCommand('type')
  .arguments('<text:string>')
  .description('Type text via xdotool')
  .action(async (_opts: Record<string, unknown>, _ctx: Ctx, text: string) => {
    const result = await executeDesktopAction({ action: 'type', text });
    console.log(
      result.success
        ? green(i18n.t('cli.desktop.typed'))
        : i18n.t('cli.desktop.typeFailed', { error: result.error ?? 'unknown' }),
    );
  });

const clipboardCmd = cortexCommand('clipboard')
  .description('Read clipboard contents')
  .action(async () => {
    const result = await executeDesktopAction({ action: 'get_clipboard' });
    if (result.success) {
      console.log(dim(result.output ?? ''));
    } else {
      console.error(i18n.t('cli.desktop.clipboardFailed', { error: result.error ?? 'unknown' }));
    }
  });

export const desktopCommand = cortexCommand('desktop')
  .description('Desktop automation tools and Docker sandbox')
  .action(async () => {
    console.log('');
    console.log('  Cortex Desktop Automation');
    console.log('');
    console.log('  Commands:');
    console.log('    cortex desktop dockerfile     — Print Docker image template');
    console.log('    cortex desktop entrypoint     — Print container entrypoint script');
    console.log('    cortex desktop screenshot     — Take screenshot');
    console.log('    cortex desktop click <x> <y>  — Click coordinates');
    console.log('    cortex desktop type <text>    — Type text');
    console.log('    cortex desktop clipboard      — Get clipboard contents');
    console.log('');
  })
  .command('dockerfile', dockerfileCmd)
  .command('entrypoint', entrypointCmd)
  .command('screenshot', screenshotCmd)
  .command('click', clickCmd)
  .command('type', typeCmd)
  .command('clipboard', clipboardCmd);
