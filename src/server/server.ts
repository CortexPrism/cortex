import { handleApi } from './router.ts';
import { handleWebSocket } from './ws.ts';
import { serveUi } from './ui.ts';
import { runMigrations } from '../db/migrate.ts';

export interface ServeOptions {
  port: number;
  host: string;
}

export async function startServer(opts: ServeOptions): Promise<void> {
  await runMigrations();

  const { port, host } = opts;

  console.log('');
  console.log(`  Cortex server starting on http://${host}:${port}`);
  console.log(`  WebSocket: ws://${host}:${port}/ws`);
  console.log(`  Press Ctrl+C to stop\n`);

  Deno.serve({ port, hostname: host }, async (req: Request): Promise<Response> => {
    const url = new URL(req.url);

    if (url.pathname === '/ws') {
      const upgrade = req.headers.get('upgrade') ?? '';
      if (upgrade.toLowerCase() !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426 });
      }
      return handleWebSocket(req);
    }

    if (url.pathname.startsWith('/api/')) {
      const res = await handleApi(req);
      return res ?? new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return serveUi();
  });
}
