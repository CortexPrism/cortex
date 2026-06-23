import type { ChannelEvent, EventHandler } from './types.ts';
import { agentTurn } from '../agent/loop.ts';
import { buildSystemPrompt } from '../agent/soul.ts';
import { createSession } from '../db/sessions.ts';
import { initSessionDb } from '../db/migrate.ts';
import { getCoreDb } from '../db/client.ts';
import { loadConfig } from '../config/config.ts';
import type { ProviderKind } from '../config/config.ts';
import { sendToChannel } from './manager.ts';
import { getAgent, getDefaultAgent, loadAgentIdentity } from '../agent/manager.ts';
import { globalRegistry } from '../tools/registry.ts';

interface ChannelSessionRow {
  id: string;
  channel_id: string;
  platform: string;
  platform_channel_id: string;
  platform_thread_id: string | null;
  platform_user_id: string;
  session_id: string;
}

async function resolveChannelSession(
  channelId: string,
  platform: string,
  platformChannelId: string,
  threadId: string | undefined,
  userId: string,
  agentId: string,
): Promise<string> {
  const db = await getCoreDb();

  const existing = await db.get<ChannelSessionRow>(
    `SELECT * FROM channel_sessions
     WHERE channel_id = ? AND platform_channel_id = ?
     AND (platform_thread_id = ? OR (platform_thread_id IS NULL AND ? IS NULL))
     AND platform_user_id = ?
     ORDER BY last_message_at DESC
     LIMIT 1`,
    [channelId, platformChannelId, threadId ?? null, threadId ?? null, userId],
  );

  if (existing) {
    await db.run(
      `UPDATE channel_sessions SET last_message_at = ? WHERE id = ?`,
      [Date.now(), existing.id],
    );
    return existing.session_id;
  }

  const sessionId = `sess_${Date.now().toString(36)}_${platform}`;
  const csId = `cs_${Date.now().toString(36)}_${platform.slice(0, 4)}`;

  await createSession(sessionId, platform, undefined, agentId);
  await db.run(
    `INSERT INTO channel_sessions (id, channel_id, platform, platform_channel_id, platform_thread_id, platform_user_id, session_id, started_at, last_message_at, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      csId,
      channelId,
      platform,
      platformChannelId,
      threadId ?? null,
      userId,
      sessionId,
      Date.now(),
      Date.now(),
      '{}',
    ],
  );

  return sessionId;
}

export function createChannelEventHandler(
  channelId: string,
  protocol: string,
  agentId: string,
): EventHandler {
  return async (event: ChannelEvent): Promise<void> => {
    try {
      const sessionId = await resolveChannelSession(
        channelId,
        protocol,
        event.channel.id,
        event.channel.parentId,
        event.author.id,
        agentId,
      );

      const config = await loadConfig();
      const agent = await getAgent(agentId) ?? await getDefaultAgent();

      const providerKind: ProviderKind = agent.provider || config.defaultProvider;
      const model = agent.model || config.providers[providerKind]?.model || 'unknown';

      const { buildProviderFromConfig, buildRouter } = await import('../llm/router.ts');
      const provider = buildProviderFromConfig(
        providerKind,
        config.providers[providerKind] ?? { kind: providerKind, model },
      );
      const router = buildRouter(config);
      const effectiveProvider = router ?? provider;

      const registry = globalRegistry;
      const { registerAllBuiltins } = await import('../tools/registry.ts');
      const allTools = await registerAllBuiltins(registry, true);

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

      const identity = await loadAgentIdentity(agent);
      const systemPrompt = buildSystemPrompt(
        identity.soul,
        agent.systemPrompt,
        identity.user,
        identity.memory,
      );

      const workingDir = Deno.cwd();
      const { getAgentWorkspaceDir } = await import('../workspace/paths.ts');
      const workspaceDir = getAgentWorkspaceDir(agent.id);
      await Deno.mkdir(workspaceDir, { recursive: true }).catch(() => {});

      const sessionDb = await initSessionDb(sessionId);

      const result = await agentTurn({
        userMessage: event.text,
        provider: effectiveProvider,
        model,
        sessionDb,
        sessionId,
        systemPrompt,
        stream: false,
        registry,
        toolContext: {
          workingDir,
          agentId: agent.id,
          workspaceDir,
          model,
          provider: providerKind,
        },
        agentConfig: agent,
      });

      if (result.response) {
        await sendToChannel(channelId, event.channel, { text: result.response });
      }
    } catch (e) {
      console.error(
        `[channels:bridge] Error handling event for ${protocol}:${channelId}:`,
        (e as Error).message,
      );
      try {
        await sendToChannel(channelId, event.channel, {
          text: `Sorry, I encountered an error: ${(e as Error).message}`,
        });
      } catch {
        // best effort
      }
    }
  };
}
