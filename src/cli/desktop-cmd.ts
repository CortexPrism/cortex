import { Command } from '@cliffy/command';
import { getDockerfile, getEntrypointScript, executeDesktopAction } from '../desktop/automation.ts';
import { Input } from '@cliffy/prompt';
import { green, dim } from '@std/fmt/colors';

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
      const path = `/tmp/cortex-screenshot-${Date.now()}.png`;
      await Deno.writeFile(path, result.screenshot);
      console.log(green(`Screenshot saved: ${path} (${result.durationMs}ms)`));
    } else {
      console.error(`Screenshot failed: ${result.error}`);
    }
  });

desktopCommand
  .command('click <x:number> <y:number>')
  .description('Click at coordinates')
  .action(async (_opts: void, x: number, y: number) => {
    const result = await executeDesktopAction({ action: 'click', x, y });
    console.log(result.success ? green(`Clicked (${x},${y})`) : `Failed: ${result.error}`);
  });

desktopCommand
  .command('type <text:string>')
  .description('Type text via xdotool')
  .action(async (_opts: void, text: string) => {
    const result = await executeDesktopAction({ action: 'type', text });
    console.log(result.success ? green('Typed') : `Failed: ${result.error}`);
  });

desktopCommand
  .command('clipboard')
  .description('Read clipboard contents')
  .action(async () => {
    const result = await executeDesktopAction({ action: 'get_clipboard' });
    if (result.success) {
      console.log(dim(result.output ?? ''));
    } else {
      console.error(`Clipboard read failed: ${result.error}`);
    }
  });

export { desktopCommand };
