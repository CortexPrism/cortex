import { Command } from '@cliffy/command';
import { startServer } from '../server/server.ts';

export const serveCommand = new Command()
  .name('serve')
  .description('Start the Cortex HTTP + WebSocket server with Web UI')
  .option('-p, --port <port:number>', 'Port to listen on', { default: 3000 })
  .option('-H, --host <host:string>', 'Host to bind to', { default: '127.0.0.1' })
  .action(async (opts: { port: number; host: string }) => {
    await startServer({ port: opts.port, host: opts.host });
  });
