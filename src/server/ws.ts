import { agentTurn } from '../agent/loop.ts';
import { loadSoul, buildSystemPrompt } from '../agent/soul.ts';
import { createSession, closeSession } from '../db/sessions.ts';
import { logEvent } from '../db/lens.ts';
import { initSessionDb } from '../db/migrate.ts';
import { buildProvider } from '../llm/router.ts';
import { loadConfig } from '../config/config.ts';
import { buildEmbedder } from '../memory/embeddings.ts';
import { ToolRegistry } from '../tools/registry.ts';
import { fileReadTool } from '../tools/builtin/file_read.ts';
import { webSearchTool } from '../tools/builtin/web_search.ts';
import { codeExecTool } from '../tools/builtin/code_exec.ts';

type WsMsg =
  | { type: 'chat'; message: string; sessionId?: string }
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

    if (msg.type === 'chat') {
      if (!msg.message?.trim()) {
        send(ws, { type: 'error', error: 'Empty message' });
        return;
      }

      try {
        const config = await loadConfig();
        const provider = buildProvider(config);
        const activeConfig = config.providers[config.defaultProvider]!;
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
            summary: `WebSocket session started`,
            started_at: new Date().toISOString(),
          });
          send(ws, { type: 'session', sessionId });
        }

        const soul = await loadSoul();
        const systemPrompt = buildSystemPrompt(soul);

        const registry = new ToolRegistry();
        registry.register(fileReadTool);
        registry.register(webSearchTool);
        registry.register(codeExecTool);

        send(ws, { type: 'start' });

        const result = await agentTurn({
          userMessage: msg.message,
          provider: provider!,
          model: activeConfig.model,
          sessionDb: sessionDbRef!,
          sessionId,
          systemPrompt,
          stream: true,
          onChunk: (chunk) => send(ws, { type: 'chunk', delta: chunk }),
          registry,
          toolContext: { workingDir: Deno.cwd() },
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
