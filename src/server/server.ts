import { handleApi } from './router.ts';
import { handleWebSocket } from './ws.ts';
import { handleNodeWebSocket } from '../hub/ws-node.ts';
import { serveUi } from './ui.ts';
import { serveLoginPage, serveOnboardingPage } from './ui-auth.ts';
import { runMigrations } from '../db/migrate.ts';
import { ensureDaemons } from '../cli/daemon.ts';
import { loadConfig } from '../config/config.ts';
import { hasPassword, parseCookies, requireAuth } from './auth.ts';

export interface ServeOptions {
  port: number;
  host: string;
}

export async function startServer(opts: ServeOptions): Promise<void> {
  await runMigrations();

  // Register built-in skills and load filesystem skills
  try {
    const { registerBuiltinSkills: registerSkills } = await import('../memory/skills.ts');
    const loaded = await registerSkills();
    console.log(`  Skills: registered/loaded ${loaded} skill(s)`);
  } catch (e) {
    console.error(`  Skills: Failed to register builtin skills - ${(e as Error).message}`);
  }

  // Load plugins after migrations to ensure database is ready
  try {
    const { pluginManager } = await import('../plugins/manager.ts');
    await pluginManager.loadAll();
  } catch (e) {
    console.error(`[plugins] Failed to load plugins: ${(e as Error).message}`);
  }

  ensureDaemons().catch(() => {});

  const { port, host } = opts;

  console.log('');
  console.log(`  Cortex server starting on http://${host}:${port}`);
  console.log(`  WebSocket:    ws://${host}:${port}/ws`);
  console.log(`  Node WS:      ws://${host}:${port}/ws/node`);
  console.log(`  Press Ctrl+C to stop\n`);

  Deno.serve({ port, hostname: host }, async (req: Request): Promise<Response> => {
    const url = new URL(req.url);

    if (url.pathname === '/ws') {
      const upgrade = req.headers.get('upgrade') ?? '';
      if (upgrade.toLowerCase() !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426 });
      }
      return await handleWebSocket(req);
    }

    if (url.pathname === '/ws/node') {
      const upgrade = req.headers.get('upgrade') ?? '';
      if (upgrade.toLowerCase() !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426 });
      }
      return handleNodeWebSocket(req);
    }

    if (url.pathname.startsWith('/api/')) {
      const res = await handleApi(req);
      return res ?? new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Login page (no auth required)
    if (url.pathname === '/login') {
      return serveLoginPage();
    }

    // Onboarding page (no auth required)
    if (url.pathname === '/onboarding') {
      return serveOnboardingPage();
    }

    // All other UI routes require auth (if password is set)
    const config = await loadConfig();
    const webAuth = config.webAuth || {};
    if (webAuth.requireAuth !== false) {
      const pwExists = await hasPassword();
      if (pwExists) {
        const auth = await requireAuth(req);
        if (!auth.authenticated) {
          return new Response(null, {
            status: 302,
            headers: { Location: '/login' },
          });
        }
      }
    }

    return serveUi();
  });
}
