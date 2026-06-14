import { Command } from '@cliffy/command';
import { bold, green, dim, cyan } from '@std/fmt/colors';
import { startServer } from '../server/server.ts';

export const serveCommand = new Command()
  .name('serve')
  .description('Start the Cortex HTTP + WebSocket server with Web UI')
  .option('-p, --port <port:number>', 'Port to listen on', { default: 3000 })
  .option('-H, --host <host:string>', 'Host to bind to', { default: '127.0.0.1' })
  .option('-d, --daemon', 'Run the server in the background')
  .option('-r, --restart', 'Restart an existing background server (only with --daemon)')
  .action(async (opts: { port: number; host: string; daemon?: boolean; restart?: boolean }) => {
    if (opts.daemon) {
      if (opts.restart) {
        // Kill any existing cortex serve background process on this port
        const killPattern = `cortex.*main.ts.*serve.*--port ${opts.port}`;
        try {
          const killCmd = new Deno.Command('pkill', { args: ['-f', killPattern] });
          await killCmd.output();
          console.log(cyan(`  Stopped existing server on port ${opts.port}`));
          await new Promise((r) => setTimeout(r, 1000));
        } catch {
          console.log(dim(`  No existing server found on port ${opts.port}`));
        }
      }

      const cmd = new Deno.Command(Deno.execPath(), {
        args: [
          'run', '--allow-all',
          new URL('../main.ts', import.meta.url).pathname,
          'serve', '--port', String(opts.port), '--host', opts.host,
        ],
        stdout: 'null',
        stderr: 'null',
        stdin: 'null',
      });
      cmd.spawn();
      console.log(green(`  ✓ Cortex server started in background (http://${opts.host}:${opts.port})`));
      Deno.exit(0);
    }

    await startServer({ port: opts.port, host: opts.host });
  });
