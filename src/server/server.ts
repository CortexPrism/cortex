import { logger } from '../utils/logger.ts';
import { handleApi } from './new-router.ts';
import { handleWebSocket } from './ws.ts';
import { handleNodeWebSocket } from '../hub/ws-node.ts';
import { serveUi } from './ui/mod.ts';
import { serveLoginPage, serveOnboardingPage } from './ui-auth.ts';
import { runMigrations } from '../db/migrate.ts';
import { ensureDaemons, schedulePluginUpdateChecks } from '../cli/daemon.ts';
import { isFirstRun, loadConfig } from '../config/config.ts';
import { configureLogger } from '../utils/logger.ts';
import { PATHS } from '../config/paths.ts';
import {
  checkVaultAvailability,
  hasPassword,
  isVaultUnavailable,
  parseCookies,
  requireAuth,
} from './auth.ts';
import { startAutoServices, stopAllServices } from '../services/manager.ts';
import { setWebhookJobCreator } from '../triggers/webhook.ts';
import { setWatcherJobCreator, startWatchers } from '../triggers/watcher.ts';
import { createTriggerJobCreator } from '../triggers/job-creator.ts';
import { setGitHookServerPort } from '../triggers/git-hooks.ts';
import { SECURITY_HEADERS } from './security-headers.ts';
import { i18n } from '../i18n/service.ts';
import { extractLocale } from '../i18n/middleware.ts';
import { kernel } from '../kernel/mod.ts';

const _log = logger('server');

export interface ServeOptions {
  port: number;
  host: string;
}

export async function startServer(opts: ServeOptions): Promise<void> {
  await runMigrations();

  // Ensure install manifest exists (auto-detect install type)
  try {
    const { loadManifest } = await import('../update/installer.ts');
    await loadManifest();
  } catch {
    // Non-critical
  }

  // Initialise the logger from persisted config
  const _serverConfig = await loadConfig();

  // Initialize i18n
  const localesDir = PATHS.localesDir;
  await i18n.init(_serverConfig.locale, localesDir);
  const _loggingCfg = _serverConfig.logging ?? { level: 'error', fileEnabled: true };
  configureLogger({
    level: _loggingCfg.level as import('../utils/logger.ts').LogLevel,
    fileEnabled: _loggingCfg.fileEnabled,
    filePath: _loggingCfg.filePath ?? PATHS.logFile,
    fileMaxBytes: _loggingCfg.fileMaxBytes,
    fileMaxFiles: _loggingCfg.fileMaxFiles,
  });

  // Pre-start sanity checks
  if (await isFirstRun()) {
    _log.warn(
      'No config file found — server starting with defaults. Run `cortex setup` or visit /onboarding.',
    );
  }

  const activeProvider = _serverConfig.defaultProvider;
  const providerCfg = _serverConfig.providers[activeProvider];
  if (
    !providerCfg?.apiKey && activeProvider !== 'ollama' && activeProvider !== 'lmstudio' &&
    activeProvider !== 'litellm'
  ) {
    _log.warn(
      `No API key configured for provider "${activeProvider}". LLM operations will fail. Run \`cortex setup\` or visit /onboarding.`,
    );
  }

  // Vault availability check
  await checkVaultAvailability();
  if (isVaultUnavailable()) {
    _log.warn(
      'VAULT UNAVAILABLE: CORTEX_VAULT_KEY not set. Web password auth and encrypted credential storage are disabled. Set CORTEX_VAULT_KEY to enable security features.',
    );
  }

  const pwExists = await hasPassword();
  if (!pwExists && !(await isFirstRun())) {
    _log.warn(
      'No web password set. Web UI is UNPROTECTED. Set a password at /onboarding or run `cortex setup`.',
    );
  }

  // Emit startup marker — always lands in file (warn >= FILE_MIN_LEVEL)
  _log.warn(`Cortex server starting`, {
    host: opts.host,
    port: opts.port,
    level: _loggingCfg.level ?? 'error',
    logFile: _loggingCfg.filePath ?? PATHS.logFile,
  });

  // Register main server as root process (pid 0 parent) in the OS kernel.
  kernel.registerProcess({
    pid: Deno.pid,
    parentPid: 0,
    agentId: 'server',
    sessionId: 'kernel',
    role: 'admin',
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

  // Initialize A2A executor — wires the agent loop into the A2A JSON-RPC server
  try {
    const a2aConfig = _serverConfig.a2a;
    if (a2aConfig?.enabled !== false) {
      const { registerA2AExecutor } = await import('../a2a/mod.ts');
      const { createA2AExecutor } = await import('../a2a/executor.ts');
      registerA2AExecutor(createA2AExecutor());
      _log.info('A2A executor registered');
    } else {
      _log.info('A2A executor disabled via config');
    }
  } catch (e) {
    _log.warn(`Failed to register A2A executor`, { error: (e as Error).message });
  }

  // Register built-in tools into global registry for API listing
  try {
    const { globalRegistry, registerAllBuiltins } = await import('../tools/registry.ts');
    await registerAllBuiltins(globalRegistry, true);
    _log.info('Built-in tools registered');
  } catch (e) {
    _log.warn(`Failed to register built-in tools`, { error: (e as Error).message });
  }

  // Initialize Skill Bus for cross-plugin event orchestration
  try {
    const { initSkillBus } = await import('../agent/skill-bus.ts');
    initSkillBus();
    _log.info('Skill Bus initialized');
  } catch (e) {
    _log.warn(`Failed to initialize Skill Bus`, { error: (e as Error).message });
  }

  // Wire trigger job creators and start file watchers
  try {
    const jobCreator = createTriggerJobCreator();
    setWebhookJobCreator(jobCreator);
    setWatcherJobCreator(jobCreator);
    setGitHookServerPort(opts.port);
    await startWatchers();
    _log.info('Trigger job creators wired and watchers started');
  } catch (e) {
    _log.warn(`Failed to initialize trigger job creators`, { error: (e as Error).message });
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

  // Auto-start tunnel if configured and autoStart is enabled
  const _tunnelCfg = _serverConfig.tunnel;
  if (_tunnelCfg?.autoStart) {
    (async () => {
      try {
        const { startTunnel } = await import('../tunnel/manager.ts');
        const state = await startTunnel(_tunnelCfg, opts.port);
        if (state.url) {
          _log.warn(`Tunnel started (${_tunnelCfg.provider}): ${state.url}`);
        } else {
          _log.info(`Tunnel started (${_tunnelCfg.provider}), status=${state.status}`);
        }
      } catch (err_) {
        _log.warn(`Failed to auto-start tunnel: ${(err_ as Error).message}`);
      }
    })().catch(() => {});
  }

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

  // Auto-start enabled channels from DB on server boot
  (async () => {
    try {
      const { listChannels: listStoredChannels, buildChannelConfig } = await import(
        '../channels/store.ts'
      );
      const stored = await listStoredChannels();
      for (const record of stored) {
        if (!record.enabled) continue;
        try {
          const adapterPath = `../channels/${record.channelType}.ts`;
          const mod = await import(adapterPath);
          const plugin = mod.default || mod.createPlugin?.();
          if (!plugin) continue;
          const channelConfig = await buildChannelConfig(record);
          const { registerChannel, startChannel } = await import('../channels/manager.ts');
          registerChannel(record.id, plugin, channelConfig, record.agentId);
          await startChannel(record.id);
          _log.info(`Channel auto-started: ${record.channelType} (${record.id})`);
        } catch (e) {
          _log.warn(`Failed to auto-start channel ${record.id}: ${(e as Error).message}`);
        }
      }
    } catch {
      // Non-critical
    }
  })().catch(() => {});

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
        if (isVaultUnavailable()) {
          return new Response(
            'CortexPrism server requires CORTEX_VAULT_KEY to be set. Authentication is unavailable.',
            {
              status: 503,
              headers: { ...SECURITY_HEADERS, 'Content-Type': 'text/plain' },
            },
          );
        }
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

      const locale = await extractLocale(req);
      const ui = serveUi(locale, config.uiCdn);
      const headers = new Headers(ui.headers);
      for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
        if (!headers.has(key)) headers.set(key, value);
      }
      return new Response(ui.body, { status: ui.status, headers });
    },
  );

  _log.info(`Cortex server listening on http://${host}:${port}`);

  const pidFile = `${PATHS.dataDir}/server.pid`;
  try {
    await Deno.writeTextFile(pidFile, String(Deno.pid));
  } catch {
    // Non-fatal if PID file can't be written
  }

  const shutdown = async () => {
    _log.info('Server shutting down...');
    try {
      await Deno.remove(pidFile).catch(() => {});
    } catch { /* ignore */ }
    try {
      await stopAllServices();
    } catch (e) {
      _log.error(`Error stopping services during shutdown`, { error: (e as Error).message });
    }
    try {
      const { stopChromeBridge } = await import(
        '../tools/builtin/chrome_bridge_manager.ts'
      );
      await stopChromeBridge().catch(() => {});
    } catch { /* ignore */ }
    try {
      httpServer.shutdown();
    } catch { /* ignore */ }
  };

  const shutdownController = new AbortController();
  Deno.addSignalListener('SIGTERM', () => shutdownController.abort());
  Deno.addSignalListener('SIGINT', () => shutdownController.abort());

  shutdownController.signal.addEventListener('abort', () => {
    shutdown().catch((e) => _log.error(`Shutdown failed`, { error: (e as Error).message }));
  }, { once: true });

  httpServer.finished.then(async () => {
    try {
      await shutdown();
    } catch { /* ignore */ }
  }).catch((err) => {
    _log.error(`Server error`, { error: (err as Error).message });
  });
}
