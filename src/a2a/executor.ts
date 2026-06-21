/**
 * A2A Executor — Wires the Cortex agent loop into the A2A server.
 *
 * Called by the A2A JSON-RPC server to execute incoming A2A SendMessage
 * requests.  Creates an ephemeral session per call so that tool use,
 * memory, and pipeline hooks all work as normal.
 */
import { agentTurn } from '../agent/loop.ts';
import { buildSystemPrompt, loadSoulContext } from '../agent/soul.ts';
import { buildProvider, buildRouter } from '../llm/router.ts';
import { loadConfig } from '../config/config.ts';
import { getDefaultAgent, loadAgentIdentity } from '../agent/manager.ts';
import { buildEmbedder } from '../memory/embeddings.ts';
import { globalRegistry, registerAllBuiltins } from '../tools/registry.ts';
import { initSessionDb } from '../db/migrate.ts';
import { closeSession, createSession } from '../db/sessions.ts';
import { logEvent } from '../db/lens.ts';
import { logger } from '../utils/logger.ts';
import type { Db } from '../db/client.ts';
import type { ProviderKind } from '../config/config.ts';

const _log = logger('a2a:executor');

async function createEphemeralSession(agentId: string): Promise<{
  sessionId: string;
  db: Db;
  providerKind: ProviderKind;
  provider: ReturnType<typeof buildProvider>;
  model: string;
  systemPrompt: string;
  embedder: ReturnType<typeof buildEmbedder>;
  providerSpecificOpts: Record<string, unknown>;
}> {
  const config = await loadConfig();
  const agent = await getDefaultAgent();

  const providerKind = agent.provider || config.defaultProvider;
  const provider = buildProvider({ ...config, defaultProvider: providerKind as never });
  const router = buildRouter(config);
  const effectiveProvider = router ?? provider;
  const model = agent.model || config.providers[providerKind]?.model || 'unknown';
  const provCfg = config.providers[providerKind];

  const identity = await loadAgentIdentity(agent);
  const systemPrompt = buildSystemPrompt(
    identity.soul,
    agent.systemPrompt,
    identity.user,
    identity.memory,
  );

  const embedder = buildEmbedder(config);

  await registerAllBuiltins(globalRegistry, true);

  const sessionId = `sess_${Date.now().toString(36)}_a2a`;
  const db = await initSessionDb(sessionId);
  await createSession(sessionId, 'a2a', undefined, agent.id);
  await logEvent({
    event_type: 'session_start',
    session_id: sessionId,
    actor: 'external_agent',
    action: 'a2a_session_start',
    summary: 'A2A external agent session started',
    started_at: new Date().toISOString(),
  });

  return {
    sessionId,
    db,
    providerKind,
    provider: effectiveProvider,
    model,
    systemPrompt,
    embedder,
    providerSpecificOpts: {
      topP: provCfg?.topP,
      repetitionPenalty: provCfg?.repetitionPenalty,
      searchRecencyFilter: provCfg?.searchRecencyFilter,
      returnCitations: provCfg?.returnCitations,
      returnImages: provCfg?.returnImages,
      httpReferer: provCfg?.httpReferer,
      xTitle: provCfg?.xTitle,
      numCtx: provCfg?.numCtx,
      numThread: provCfg?.numThread,
      keepAlive: provCfg?.keepAlive,
      dropParams: provCfg?.dropParams,
      includeVeniceSystemPrompt: provCfg?.includeVeniceSystemPrompt,
    },
  };
}

async function cleanupSession(sessionId: string, db: Db): Promise<void> {
  await Promise.allSettled([
    closeSession(sessionId),
    logEvent({
      event_type: 'session_end',
      session_id: sessionId,
      actor: 'external_agent',
      action: 'a2a_session_end',
      summary: 'A2A external agent session ended',
      started_at: new Date().toISOString(),
    }),
  ]);
  db.close();
}

/**
 * Create a CortexExecution that delegates to agentTurn.
 *
 * Returns an object conforming to the interface expected by
 * registerA2AExecutor() in src/a2a/server.ts.
 */
export function createA2AExecutor() {
  return {
    async execute(
      message: string,
      history?: string,
    ): Promise<{ response: string; tokensIn: number; tokensOut: number }> {
      let sessionId: string | null = null;
      let db: Db | null = null;

      try {
        const sess = await createEphemeralSession('default');
        sessionId = sess.sessionId;
        db = sess.db;

        let effectiveSystemPrompt = sess.systemPrompt +
          '\n\nYou are responding to an external agent via the A2A protocol. ' +
          'Be concise and direct. Use tools when helpful but prefer completing the task efficiently.';

        if (history) {
          effectiveSystemPrompt +=
            `\n\n## Conversation History (context from prior messages in this A2A session)\n${history}`;
        }

        _log.info(`A2A executor: processing message`, {
          sessionId,
          messageLength: message.length,
          hasHistory: !!history,
        });

        const result = await agentTurn({
          userMessage: message,
          provider: sess.provider,
          model: sess.model,
          sessionDb: db,
          sessionId,
          systemPrompt: effectiveSystemPrompt,
          stream: false,
          ...sess.providerSpecificOpts,
          registry: globalRegistry,
          toolContext: {
            workingDir: Deno.cwd(),
            agentId: 'assistant',
            workspaceDir: Deno.cwd(),
            model: sess.model,
            provider: sess.providerKind,
          },
          embedder: sess.embedder,
          enableReflection: false,
          maxToolRounds: 4,
        });

        _log.info(`A2A executor: response ready`, {
          sessionId,
          responseLength: result.response.length,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
        });

        return {
          response: result.response,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
        };
      } finally {
        if (sessionId && db) {
          cleanupSession(sessionId, db).catch((e) => {
            _log.warn('A2A session cleanup failed', { sessionId, error: (e as Error).message });
          });
        }
      }
    },
  };
}
