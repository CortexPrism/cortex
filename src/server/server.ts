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
import { startAutoServices } from '../services/manager.ts';
import { SECURITY_HEADERS } from './security-headers.ts';

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

  // Initialize Skill Bus for cross-plugin event orchestration
  try {
    const { initSkillBus } = await import('../agent/skill-bus.ts');
    initSkillBus();
    _log.info('Skill Bus initialized');
  } catch (e) {
    _log.warn(`Failed to initialize Skill Bus`, { error: (e as Error).message });
  }

  // Start dependency guardian periodic check (every 6 hours)
  setInterval(() => {
    import('../plugins/dependency-guardian.ts').then(({ checkAllProjects }) => {
      checkAllProjects().catch(() => {});
    }).catch(() => {});
  }, 6 * 60 * 60 * 1000);

  ensureDaemons().catch(() => {});
  startAutoServices().catch(() => {});
  schedulePluginUpdateChecks();

  // Auto-start chrome-bridge if configured (non-blocking)
  const _chromeCfg = _serverConfig.chromeBridge;
  if (_chromeCfg?.enabled && _chromeCfg?.autoStart) {
    (async () => {
      const { startChromeBridge, registerChromeBridgeTools } = await import(
        '../tools/builtin/chrome_bridge_manager.ts'
      );
      try {
        await startChromeBridge(_chromeCfg);
        if (_chromeCfg.autoRegisterTools !== false) {
          const { globalRegistry } = await import('../tools/registry.ts');
          const count = await registerChromeBridgeTools(globalRegistry, _chromeCfg);
          _log.info(`Registered ${count} chrome-bridge tools`);
        }
      } catch (err) {
        _log.warn(`Failed to start chrome-bridge: ${(err as Error).message}`);
      }
    })().catch(() => {});
  }

  const { port, host } = opts;

  _log.info(`Cortex server starting on http://${host}:${port}`, { host, port });
  _log.info(`WebSocket: ws://${host}:${port}/ws`);
  _log.info(`Node WS:   ws://${host}:${port}/ws/node`);

  const serverConfig = _serverConfig.server ??
    { corsOrigin: 'same-origin', maxBodyBytes: 10_485_760 };
  const maxBodyBytes = serverConfig.maxBodyBytes;
  const corsOrigin = serverConfig.corsOrigin;

  const serveOpts: Record<string, unknown> = {
    port,
    hostname: host,
  };

  if (serverConfig.https?.enabled && serverConfig.https.certFile && serverConfig.https.keyFile) {
    serveOpts.certFile = serverConfig.https.certFile;
    serveOpts.keyFile = serverConfig.https.keyFile;
    _log.info(`HTTPS enabled`);
  }

  const httpServer = Deno.serve(
    serveOpts as Deno.ServeOptions,
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
        const contentLength = Number(req.headers.get('content-length') ?? 0);
        if (contentLength > maxBodyBytes) {
          return new Response(JSON.stringify({ error: 'Request body too large' }), {
            status: 413,
            headers: { ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
          });
        }
        const res = await handleApi(req);
        return res ?? new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
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
              headers: { Location: '/login', ...SECURITY_HEADERS },
            });
          }
        }
      }

      const ui = serveUi();
      const headers = new Headers(ui.headers);
      for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
        if (!headers.has(key)) headers.set(key, value);
      }
      return new Response(ui.body, { status: ui.status, headers });
    },
  );

  httpServer.finished.then(async () => {
    const { stopChromeBridge } = await import(
      '../tools/builtin/chrome_bridge_manager.ts'
    );
    await stopChromeBridge().catch(() => {});
  }).catch((err) => {
    _log.error(`Server error`, { error: (err as Error).message });
  });
}
