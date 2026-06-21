import type { AgentConfig, CortexConfig } from '../config/config.ts';
import { isFirstRun, loadConfig } from '../config/config.ts';
import { configureLogger } from '../utils/logger.ts';
import { PATHS } from '../config/paths.ts';
import { buildProvider, buildRouter } from '../llm/router.ts';
import type { LLMProvider } from '../llm/types.ts';
import { initSessionDb, runMigrations } from '../db/migrate.ts';
import { runSetupWizard } from './setup.ts';
import { buildSystemPrompt } from '../agent/soul.ts';
import { closeSession, createSession, getSession, resumeSession } from '../db/sessions.ts';
import { logEvent } from '../db/lens.ts';
import { globalRegistry } from '../tools/registry.ts';
import type { ToolRegistry } from '../tools/registry.ts';
import { ensureDaemons } from './daemon.ts';
import { buildEmbedder } from '../memory/embeddings.ts';
import type { EmbeddingProvider } from '../memory/embeddings.ts';
import {
  formatSkillsAsAvailableList,
  getAllHumanSkills,
  registerBuiltinSkills,
} from '../memory/skills.ts';
import { getDefaultAgent, loadAgentIdentity } from '../agent/manager.ts';
import { i18n } from '../i18n/service.ts';
import type { Db } from '../db/client.ts';

export interface AgentSessionOptions {
  model?: string;
  provider?: string;
  agent?: string;
  resume?: string;
  enableStream?: boolean;
  sandboxDebug?: boolean;
}

export interface AgentSession {
  sid: string;
  sessionDb: Db;
  config: CortexConfig;
  agent: AgentConfig;
  provider: LLMProvider;
  effectiveProvider: LLMProvider;
  model: string;
  systemPrompt: string;
  embedder: EmbeddingProvider | undefined;
  registry: ToolRegistry;
  reasoningEffort?: string;
  enableStream: boolean;
}

export async function createAgentSession(
  options: AgentSessionOptions,
): Promise<AgentSession> {
  if (options.sandboxDebug) {
    const { setSandboxDebug } = await import('../sandbox/logger.ts');
    setSandboxDebug(true);
  }

  let config = await loadConfig();

  const _loggingCfg = config.logging ?? { level: 'error', fileEnabled: true };
  configureLogger({
    level: _loggingCfg.level as import('../utils/logger.ts').LogLevel,
    fileEnabled: _loggingCfg.fileEnabled,
    filePath: _loggingCfg.filePath ?? PATHS.logFile,
    fileMaxBytes: _loggingCfg.fileMaxBytes,
    fileMaxFiles: _loggingCfg.fileMaxFiles,
  });

  if (await isFirstRun()) {
    config = await runSetupWizard(config);
  } else {
    await runMigrations();
  }

  ensureDaemons().catch(() => {});

  let agent: AgentConfig;
  if (options.agent) {
    const { getAgent } = await import('../agent/manager.ts');
    const found = await getAgent(options.agent);
    if (!found) {
      throw new Error(i18n.t('cli.chat.error.agentNotFound', { agent: options.agent }));
    }
    agent = found;
  } else {
    agent = await getDefaultAgent();
  }

  if (options.provider) {
    config = { ...config, defaultProvider: options.provider as never };
  } else if (agent.provider) {
    config = { ...config, defaultProvider: agent.provider as never };
  }

  const provider = buildProvider(config);
  const model = options.model ?? agent.model ??
    config.providers[config.defaultProvider]?.model ?? 'unknown';

  const reasoningEffort = config.providers[config.defaultProvider]?.reasoningEffort;
  const router = buildRouter(config);
  const effectiveProvider = router ?? provider;

  function makeSessionId(): string {
    return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  const sid = options.resume ?? makeSessionId();
  const sessionDb = await initSessionDb(sid);

  const identity = await loadAgentIdentity(agent);
  let systemPrompt = buildSystemPrompt(
    identity.soul,
    agent.systemPrompt,
    identity.user,
    identity.memory,
  );

  const embedder = buildEmbedder(config);

  await registerBuiltinSkills(undefined, embedder).catch(() => {});
  const humanSkills = await getAllHumanSkills().catch(() => []);
  if (humanSkills.length > 0) {
    systemPrompt += formatSkillsAsAvailableList(humanSkills);
  }

  if (options.resume) {
    const existing = await getSession(sid);
    if (!existing) {
      throw new Error(i18n.t('cli.chat.error.sessionNotFound', { id: sid }));
    }
    await resumeSession(sid);
  } else {
    await createSession(sid, 'cli');
  }

  const sessionStart = new Date().toISOString();
  await logEvent({
    event_type: 'session_start',
    session_id: sid,
    actor: 'user',
    action: 'session_start',
    summary: `CLI session started with agent "${agent.name}" / ${effectiveProvider.name}/${model}`,
    started_at: sessionStart,
  });

  const registry = globalRegistry;
  const { registerAllBuiltins } = await import('../tools/registry.ts');
  const allTools = await registerAllBuiltins(registry, false);

  if (agent.tools?.length) {
    for (const name of Object.keys(allTools)) {
      registry.unregister(name);
    }
    for (const name of agent.tools) {
      if (allTools[name]) {
        registry.register(allTools[name]);
      }
    }
  }

  const { pluginManager } = await import('../plugins/manager.ts');
  await pluginManager.loadAll().catch(() => {});

  return {
    sid,
    sessionDb,
    config,
    agent,
    provider,
    effectiveProvider,
    model,
    systemPrompt,
    embedder,
    registry,
    reasoningEffort,
    enableStream: options.enableStream !== false,
  };
}

export async function endAgentSession(
  session: AgentSession,
): Promise<void> {
  await Promise.allSettled([
    closeSession(session.sid),
    logEvent({
      event_type: 'session_end',
      session_id: session.sid,
      actor: 'user',
      action: 'session_end',
      started_at: new Date().toISOString(),
    }),
  ]);
  session.sessionDb.close();
}
