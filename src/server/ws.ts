import { agentTurn } from '../agent/loop.ts';
import { loadSoulContext, buildSystemPrompt } from '../agent/soul.ts';
import { createSession, closeSession } from '../db/sessions.ts';
import { logEvent } from '../db/lens.ts';
import { initSessionDb } from '../db/migrate.ts';
import { buildProvider } from '../llm/router.ts';
import { loadConfig } from '../config/config.ts';
import type { AgentConfig } from '../config/config.ts';
import { buildEmbedder } from '../memory/embeddings.ts';
import { ToolRegistry } from '../tools/registry.ts';
import type { Tool } from '../tools/types.ts';
import { fileReadTool } from '../tools/builtin/file_read.ts';
import { webSearchTool } from '../tools/builtin/web_search.ts';
import { codeExecTool } from '../tools/builtin/code_exec.ts';
import { subAgentTool } from '../tools/builtin/sub_agent.ts';
import {
  fileWriteTool,
  fileEditTool,
  filePatchTool,
  fileDeleteTool,
  fileRenameTool,
  fileListTool,
  fileTreeTool,
  fileInfoTool,
  fileSearchTool,
  fileUndoTool,
  fileRedoTool,
} from '../tools/builtin/workspace/index.ts';
import { getDefaultAgent, loadAgentIdentity } from '../agent/manager.ts';

type WsMsg =
  | { type: 'chat'; message: string; sessionId?: string; agentId?: string }
  | { type: 'new_session' }
  | { type: 'select_agent'; agentId: string }
  | { type: 'ping' };

function send(ws: WebSocket, data: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

export function handleWebSocket(req: Request): Response {
  const { socket: ws, response } = Deno.upgradeWebSocket(req);

  let sessionId: string | null = null;
  let sessionDbRef: Awaited<ReturnType<typeof initSessionDb>> | null = null;

  ws.onopen = () => send(ws, { type: 'connected' });

  ws.onclose = async () => {
    if (sessionId && sessionDbRef) {
      await Promise.allSettled([
        closeSession(sessionId),
        logEvent({
          event_type: 'session_end',
          session_id: sessionId,
          actor: 'system',
          action: 'session_end',
          summary: 'WebSocket session closed',
          started_at: new Date().toISOString(),
        }),
      ]);
      sessionDbRef.close();
    }
  };

  // Currently selected agent ID for this session
  let activeAgent: AgentConfig | null = null;

  async function resolveAgent(agentId?: string): Promise<AgentConfig> {
    if (agentId) {
      const { getAgent } = await import('../agent/manager.ts');
      const agent = await getAgent(agentId);
      if (agent) return agent;
    }
    if (activeAgent) return activeAgent;
    return await getDefaultAgent();
  }

  ws.onmessage = async (event: MessageEvent) => {
    let msg: WsMsg;
    try {
      msg = JSON.parse(event.data as string) as WsMsg;
    } catch {
      send(ws, { type: 'error', error: 'Invalid JSON' });
      return;
    }

    if (msg.type === 'ping') {
      send(ws, { type: 'pong' });
      return;
    }

    // Select agent for this WebSocket session
    if (msg.type === 'select_agent') {
      const { getAgent } = await import('../agent/manager.ts');
      const agent = await getAgent(msg.agentId);
      if (agent) {
        activeAgent = agent;
        send(ws, { type: 'agent_selected', agentId: agent.id, agentName: agent.name });
      } else {
        send(ws, { type: 'error', error: `Agent "${msg.agentId}" not found` });
      }
      return;
    }

    // New session — reset session state without closing WS
    if (msg.type === 'new_session') {
      if (sessionId && sessionDbRef) {
        await Promise.allSettled([
          closeSession(sessionId),
          logEvent({
            event_type: 'session_end',
            session_id: sessionId,
            actor: 'system',
            action: 'session_end',
            summary: 'Session ended via new_session',
            started_at: new Date().toISOString(),
          }),
        ]);
        sessionDbRef.close();
      }
      sessionId = null;
      sessionDbRef = null;
      send(ws, { type: 'session_ended' });
      return;
    }

    if (msg.type === 'chat') {
      if (!msg.message?.trim()) {
        send(ws, { type: 'error', error: 'Empty message' });
        return;
      }

      try {
        const config = await loadConfig();
        const agent = await resolveAgent(msg.agentId);
        activeAgent = agent;

        // Resolve provider: agent-specific or default
        const providerKind = agent.provider || config.defaultProvider;
        const provider = buildProvider({ ...config, defaultProvider: providerKind as never });
        const model = agent.model || config.providers[providerKind]?.model || 'unknown';
        const embedder = buildEmbedder(config);

        if (!sessionId) {
          sessionId = msg.sessionId ?? `sess_${Date.now().toString(36)}_ws`;
          sessionDbRef = await initSessionDb(sessionId);
          await createSession(sessionId, 'web');
          await logEvent({
            event_type: 'session_start',
            session_id: sessionId,
            actor: 'user',
            action: 'session_start',
            summary: `WebSocket session started with agent "${agent.name}"`,
            started_at: new Date().toISOString(),
          });
          send(ws, { type: 'session', sessionId, agentId: agent.id, agentName: agent.name });
        }

        // Load identity from agent's soul files (or inline soul)
        const identity = await loadAgentIdentity(agent);
        const systemPrompt = buildSystemPrompt(
          identity.soul,
          agent.systemPrompt,
          identity.user,
          identity.memory,
        );

        // Build tool registry respecting agent's tool allow-list
        const registry = new ToolRegistry();
        const allTools: Record<string, Tool> = {
          file_read: fileReadTool,
          file_write: fileWriteTool,
          file_edit: fileEditTool,
          file_patch: filePatchTool,
          file_delete: fileDeleteTool,
          file_rename: fileRenameTool,
          file_list: fileListTool,
          file_tree: fileTreeTool,
          file_info: fileInfoTool,
          file_search: fileSearchTool,
          file_undo: fileUndoTool,
          file_redo: fileRedoTool,
          web_search: webSearchTool,
          code_exec: codeExecTool,
          sub_agent: subAgentTool,
        };
        const allowedTools = agent.tools?.length
          ? agent.tools
          : Object.keys(allTools);
        for (const name of allowedTools) {
          if (allTools[name]) registry.register(allTools[name]);
        }

        send(ws, { type: 'start' });

        const result = await agentTurn({
          userMessage: msg.message,
          provider: provider!,
          model,
          sessionDb: sessionDbRef!,
          sessionId,
          systemPrompt,
          stream: true,
          onChunk: (chunk) => send(ws, { type: 'chunk', delta: chunk }),
          registry,
          toolContext: {
            workingDir: Deno.cwd(),
            agentId: agent.id,
            workspaceDir: (await import('../workspace/paths.ts')).getAgentWorkspaceDir(agent.id),
          },
          embedder,
        });

        send(ws, {
          type: 'done',
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          costUsd: result.costUsd,
          durationMs: result.durationMs,
        });
      } catch (e) {
        send(ws, { type: 'error', error: (e as Error).message });
      }
    }
  };

  ws.onerror = (_e: Event | ErrorEvent) => {
    send(ws, { type: 'error', error: 'WebSocket error' });
  };

  return response;
}
