import { Command } from '@cliffy/command';
import { executeDesktopAction, getDockerfile, getEntrypointScript } from '../desktop/automation.ts';
import { Input } from '@cliffy/prompt';
import { dim, green } from '@std/fmt/colors';
import { getTempDir } from '../utils/platform.ts';
import { join } from '@std/path';
import { i18n } from '../i18n/service.ts';

const desktopCommand = new Command()
  .name('desktop')
  .description('Desktop automation tools and Docker sandbox')
  .action(() => {
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
  });

desktopCommand
  .command('dockerfile')
  .description('Print the XFCE+noVNC Dockerfile')
  .action(() => {
    console.log(getDockerfile());
  });

desktopCommand
  .command('entrypoint')
  .description('Print the container entrypoint script')
  .action(() => {
    console.log(getEntrypointScript());
  });

desktopCommand
  .command('screenshot')
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

desktopCommand
  .command('click <x:number> <y:number>')
  .description('Click at coordinates')
  .action(async (_opts: void, x: number, y: number) => {
    const result = await executeDesktopAction({ action: 'click', x, y });
    console.log(
      result.success
        ? green(i18n.t('cli.desktop.clicked', { x: String(x), y: String(y) }))
        : i18n.t('cli.desktop.clickFailed', { error: result.error ?? 'unknown' }),
    );
  });

desktopCommand
  .command('type <text:string>')
  .description('Type text via xdotool')
  .action(async (_opts: void, text: string) => {
    const result = await executeDesktopAction({ action: 'type', text });
    console.log(
      result.success
        ? green(i18n.t('cli.desktop.typed'))
        : i18n.t('cli.desktop.typeFailed', { error: result.error ?? 'unknown' }),
    );
  });

desktopCommand
  .command('clipboard')
  .description('Read clipboard contents')
  .action(async () => {
    const result = await executeDesktopAction({ action: 'get_clipboard' });
    if (result.success) {
      console.log(dim(result.output ?? ''));
    } else {
      console.error(i18n.t('cli.desktop.clipboardFailed', { error: result.error ?? 'unknown' }));
    }
  });

export { desktopCommand };
