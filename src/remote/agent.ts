import type { RemoteMessage } from './types.ts';
import { executeTool, parseToolCalls } from '../tools/executor.ts';
import { globalRegistry } from '../tools/registry.ts';

interface RemoteAgentOptions {
  endpoint: string;
  token: string;
  agentId: string;
  name: string;
  reconnectMs: number;
  heartbeatMs: number;
}

export async function runRemoteAgent(opts: RemoteAgentOptions): Promise<void> {
  const { endpoint, token, agentId, name, reconnectMs, heartbeatMs } = opts;

  async function connect(): Promise<WebSocket> {
    const ws = new WebSocket(endpoint);
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('WebSocket connection failed'));
    });

    ws.send(JSON.stringify({
      type: 'register',
      agentId,
      name,
      token,
      capabilities: ['file_read', 'shell', 'code_exec', 'file_write', 'file_edit', 'file_delete', 'git'],
      version: '0.20.0',
    } satisfies RemoteMessage));

    return ws;
  }

  let ws: WebSocket | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  async function startHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'heartbeat',
          agentId,
        } satisfies RemoteMessage));
      }
    }, heartbeatMs);
  }

  async function handleDirective(msg: RemoteMessage & { type: 'directive' }) {
    const started = Date.now();
    try {
      const toolCalls = parseToolCalls(JSON.stringify(msg.params));
      if (toolCalls.length === 0) {
        ws?.send(JSON.stringify({
          type: 'result',
          directiveId: msg.id,
          success: false,
          output: '',
          error: 'No tool calls found in directive',
          durationMs: Date.now() - started,
        } satisfies RemoteMessage));
        return;
      }

      const ctx = {
        sessionId: msg.sessionId,
        workingDir: Deno.cwd(),
        agentId,
        workspaceDir: Deno.cwd(),
      };

      for (const call of toolCalls) {
        const result = await executeTool(call, globalRegistry, ctx);
        ws?.send(JSON.stringify({
          type: 'result',
          directiveId: msg.id,
          success: result.success,
          output: result.output.slice(0, 50000),
          error: result.error,
          durationMs: Date.now() - started,
        } satisfies RemoteMessage));
      }
    } catch (e) {
      ws?.send(JSON.stringify({
        type: 'result',
        directiveId: msg.id,
        success: false,
        output: '',
        error: (e as Error).message,
        durationMs: Date.now() - started,
      } satisfies RemoteMessage));
    }
  }

  while (true) {
    try {
      console.error(`[remote-agent] Connecting to ${endpoint}...`);
      ws = await connect();
      console.error(`[remote-agent] Connected as ${agentId}`);
      startHeartbeat();

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as RemoteMessage;
          if (msg.type === 'registered') {
            console.error(`[remote-agent] Registration confirmed`);
          } else if (msg.type === 'directive') {
            handleDirective(msg);
          } else if (msg.type === 'error') {
            console.error(`[remote-agent] Server error: ${msg.message}`);
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        console.error(`[remote-agent] Connection closed. Reconnecting in ${reconnectMs}ms...`);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      };

      ws.onerror = () => {
        // onclose will fire next
      };

      await new Promise<void>((resolve) => {
        if (!ws) { resolve(); return; }
        ws.onclose = () => {
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          heartbeatTimer = null;
          resolve();
        };
      });
    } catch (e) {
      console.error(`[remote-agent] Connection failed: ${(e as Error).message}`);
    }

    await new Promise((resolve) => setTimeout(resolve, reconnectMs));
  }
}
