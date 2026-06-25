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

const _log = logger('triggers:job-creator');

export interface TriggerJobResult {
  sessionId: string;
  turnId: string;
}

async function createEphemeralAgentSession(agentId: string): Promise<{
  sessionId: string;
  turnId: string;
  db: Db;
  providerKind: import('../config/config.ts').ProviderKind;
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

/**
 * Open an existing session's DB for a resumed turn (orchestration resume).
 * Does NOT create a new session record — reuses the one already in the DB.
 */
async function openExistingSession(sessionId: string): Promise<{
  db: Db;
  sessionId: string;
  turnId: string;
}> {
  const db = await initSessionDb(sessionId);
  const turnId = `turn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  _log.info(`Re-opened existing session for resume`, { sessionId, turnId });
  return { db, sessionId, turnId };
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
    providerKind: import('../config/config.ts').ProviderKind;
    /** If set, the turn is a resume of a previously yielded orchestration turn. */
    orchestrationResume?: { waitBarrierId: string; runIds: string[]; awaitMode?: string; barrierLabel?: string };
    /** If true, do NOT close the session after the turn (session is ongoing). */
    keepSessionOpen?: boolean;
  },
): void {
  (async () => {
    try {
      _log.info(`Trigger agent turn starting`, {
        sessionId,
        turnId,
        agentId,
        promptLength: prompt.length,
        isResume: !!opts.orchestrationResume,
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
        orchestrationResume: opts.orchestrationResume,
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
      if (!opts.keepSessionOpen) {
        await closeSession(sessionId).catch(() => {});
      }
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
    async createJob(
      agentId: string,
      prompt: string,
      resumeOpts?: {
        sessionId?: string;
        orchestrationResume?: { waitBarrierId: string; runIds: string[]; awaitMode?: string; barrierLabel?: string };
      },
    ): Promise<TriggerJobResult> {
      if (resumeOpts?.sessionId) {
        // ── Orchestration resume: reuse the existing session ──────────
        const { db, sessionId, turnId } = await openExistingSession(
          resumeOpts.sessionId,
        );

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

        fireAndForgetAgentTurn(sessionId, turnId, prompt, agentId, {
          db,
          provider: effectiveProvider,
          model,
          systemPrompt,
          embedder,
          providerKind,
          orchestrationResume: resumeOpts.orchestrationResume,
          keepSessionOpen: true,
        });

        return { sessionId, turnId };
      }

      // ── Standard trigger: create a fresh ephemeral session ──────────
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
