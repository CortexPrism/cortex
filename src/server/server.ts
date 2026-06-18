import { logger } from '../utils/logger.ts';
import { handleApi } from './router.ts';
import { handleWebSocket } from './ws.ts';
import { handleNodeWebSocket } from '../hub/ws-node.ts';
import { serveUi } from './ui.ts';
import { serveLoginPage, serveOnboardingPage } from './ui-auth.ts';
import { runMigrations } from '../db/migrate.ts';
import { ensureDaemons, schedulePluginUpdateChecks } from '../cli/daemon.ts';
import { loadConfig } from '../config/config.ts';
import { configureLogger } from '../utils/logger.ts';
import { PATHS } from '../config/paths.ts';
import { hasPassword, parseCookies, requireAuth } from './auth.ts';

const _log = logger('server');

export interface ServeOptions {
  port: number;
  host: string;
}

export async function startServer(opts: ServeOptions): Promise<void> {
  await runMigrations();

  // Initialise the logger from persisted config
  const _serverConfig = await loadConfig();
  const _loggingCfg = _serverConfig.logging ?? { level: 'error', fileEnabled: true };
  configureLogger({
    level: _loggingCfg.level as import('../utils/logger.ts').LogLevel,
    fileEnabled: _loggingCfg.fileEnabled,
    filePath: _loggingCfg.filePath ?? PATHS.logFile,
    fileMaxBytes: _loggingCfg.fileMaxBytes,
    fileMaxFiles: _loggingCfg.fileMaxFiles,
  });

  // Emit startup marker — always lands in file (warn >= FILE_MIN_LEVEL)
  _log.warn(`Cortex server starting`, {
    host: opts.host,
    port: opts.port,
    level: _loggingCfg.level ?? 'error',
    logFile: _loggingCfg.filePath ?? PATHS.logFile,
  });

  // Wire up OTLP if configured
  if (_loggingCfg.otlp?.endpoint || _loggingCfg.grafana?.otlpEndpoint) {
    const { configureOtel } = await import('../observability/otel.ts');
    const ep = _loggingCfg.grafana?.otlpEndpoint ?? _loggingCfg.otlp!.endpoint;
    const hdrs: Record<string, string> = { ...(_loggingCfg.otlp?.headers ?? {}) };
    if (_loggingCfg.grafana?.authToken) {
      hdrs['Authorization'] = `Bearer ${_loggingCfg.grafana.authToken}`;
    }
    configureOtel({ endpoint: ep, headers: hdrs });
  }

  // Wire up Langfuse if configured
  if (_loggingCfg.langfuse?.publicKey) {
    const { configureLangfuse } = await import('../observability/langfuse.ts');
    configureLangfuse(_loggingCfg.langfuse);
  }

  // Register built-in skills and load filesystem skills
  try {
    const { registerBuiltinSkills: registerSkills } = await import('../memory/skills.ts');
    const { buildEmbedder } = await import('../memory/embeddings.ts');
    const config = await loadConfig();
    const embedder = buildEmbedder(config);
    const loaded = await registerSkills(undefined, embedder);
    _log.info(`Skills: registered/loaded ${loaded} skill(s)`);
  } catch (e) {
    _log.error(`Skills: Failed to register builtin skills`, { error: (e as Error).message });
  }

  // Load plugins after migrations to ensure database is ready
  try {
    const { pluginManager } = await import('../plugins/manager.ts');
    await pluginManager.loadAll();
  } catch (e) {
    _log.error(`Failed to load plugins`, { error: (e as Error).message });
  }

  ensureDaemons().catch(() => {});
  schedulePluginUpdateChecks();

  const { port, host } = opts;

  _log.info(`Cortex server starting on http://${host}:${port}`, { host, port });
  _log.info(`WebSocket: ws://${host}:${port}/ws`);
  _log.info(`Node WS:   ws://${host}:${port}/ws/node`);

  const httpServer = Deno.serve(
    { port, hostname: host },
    async (req: Request): Promise<Response> => {
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
    },
  );

  httpServer.finished.catch((err) => {
    _log.error(`Server error`, { error: (err as Error).message });
  });
}
