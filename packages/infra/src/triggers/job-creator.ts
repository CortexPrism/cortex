import { agentTurn } from '../../../../src/agent/loop.ts';
import { buildSystemPrompt, type loadSoulContext } from '../../../../src/agent/soul.ts';
import { buildProvider, buildRouter } from '../../../../src/llm/router.ts';
import { loadConfig } from '../../../../src/config/config.ts';
import { getDefaultAgent, loadAgentIdentity } from '../../../../src/agent/manager.ts';
import { buildEmbedder } from '../../../../src/memory/embeddings.ts';
import { globalRegistry, registerAllBuiltins } from '../../../../src/tools/registry.ts';
import { initSessionDb } from '../../../../src/db/migrate.ts';
import { closeSession, createSession } from '../../../../src/db/sessions.ts';
import { logEvent } from '../../../../src/db/lens.ts';
import { logger } from '../../../../src/utils/logger.ts';
import type { Db } from '../../../../src/db/client.ts';

const _log = logger('triggers:job-creator');

export interface TriggerJobResult {
  sessionId: string;
  turnId: string;
}

async function createEphemeralAgentSession(agentId: string): Promise<{
  sessionId: string;
  turnId: string;
  db: Db;
  providerKind: import('../../../../src/config/config.ts').ProviderKind;
  provider: ReturnType<typeof buildProvider>;
  router: ReturnType<typeof buildRouter>;
  model: string;
  systemPrompt: string;
  embedder: ReturnType<typeof buildEmbedder>;
}> {
  const config = await loadConfig();
  const agent = await getDefaultAgent();

  const providerKind = agent.provider || config.defaultProvider;
  const provider = buildProvider(config);
  const router = buildRouter(config);
  const effectiveProvider = router ?? provider;
  const model = agent.model || config.providers[providerKind]?.model || 'unknown';

  const identity = await loadAgentIdentity(agent);
  const systemPrompt = buildSystemPrompt(
    identity.soul,
    agent.systemPrompt,
    identity.user,
    identity.memory,
  );

  const embedder = buildEmbedder(config);

  await registerAllBuiltins(globalRegistry, true);

  const sessionId = `sess_${Date.now().toString(36)}_trg`;
  const turnId = `turn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const db = await initSessionDb(sessionId);
  await createSession(sessionId, 'trigger', undefined, agent.id);
  await logEvent({
    event_type: 'session_start',
    session_id: sessionId,
    actor: 'trigger',
    action: 'trigger_session_start',
    summary: `Trigger-driven session started for agent ${agentId}`,
    started_at: new Date().toISOString(),
  });

  return {
    sessionId,
    turnId,
    db,
    providerKind,
    provider: effectiveProvider,
    router,
    model,
    systemPrompt,
    embedder,
  };
}

function fireAndForgetAgentTurn(
  sessionId: string,
  turnId: string,
  prompt: string,
  agentId: string,
  opts: {
    db: Db;
    provider: ReturnType<typeof buildProvider>;
    model: string;
    systemPrompt: string;
    embedder: ReturnType<typeof buildEmbedder>;
    providerKind: import('../../../../src/config/config.ts').ProviderKind;
  },
): void {
  (async () => {
    try {
      _log.info(`Trigger agent turn starting`, {
        sessionId,
        turnId,
        agentId,
        promptLength: prompt.length,
      });

      const result = await agentTurn({
        userMessage: prompt,
        provider: opts.provider,
        model: opts.model,
        sessionDb: opts.db,
        sessionId,
        systemPrompt:
          `${opts.systemPrompt}\n\nYou were activated by an automation trigger. Execute the requested task.`,
        stream: false,
        registry: globalRegistry,
        toolContext: {
          workingDir: Deno.cwd(),
          agentId,
          workspaceDir: Deno.cwd(),
          model: opts.model,
          provider: opts.providerKind,
        },
        embedder: opts.embedder,
        enableReflection: false,
        maxToolRounds: 10,
      });

      _log.info(`Trigger agent turn completed`, {
        sessionId,
        turnId,
        responseLength: result.response.length,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
      });
    } catch (e) {
      _log.error(`Trigger agent turn failed`, {
        sessionId,
        turnId,
        error: (e as Error).message,
      });
    } finally {
      await closeSession(sessionId).catch(() => {});
      await logEvent({
        event_type: 'session_end',
        session_id: sessionId,
        actor: 'trigger',
        action: 'trigger_session_end',
        summary: 'Trigger-driven session ended',
        started_at: new Date().toISOString(),
      }).catch(() => {});
      opts.db.close();
    }
  })().catch(() => {});
}

export function createTriggerJobCreator() {
  return {
    async createJob(agentId: string, prompt: string): Promise<TriggerJobResult> {
      const sess = await createEphemeralAgentSession(agentId);

      fireAndForgetAgentTurn(sess.sessionId, sess.turnId, prompt, agentId, {
        db: sess.db,
        provider: sess.provider,
        model: sess.model,
        systemPrompt: sess.systemPrompt,
        embedder: sess.embedder,
        providerKind: sess.providerKind,
      });

      return {
        sessionId: sess.sessionId,
        turnId: sess.turnId,
      };
    },
  };
}
