import type { NodeMessage, NodeMetrics } from './types.ts';
import { executeTool, parseToolCalls } from '../tools/executor.ts';
import { globalRegistry } from '../tools/registry.ts';
import {
  isCommandAllowedByTier,
  isPathAllowedByTier,
  isToolAllowedByTier,
} from '../hub/capability-tiers.ts';
import type { NodeTier } from '../hub/node-registry.ts';

export interface NodeAgentOptions {
  endpoint: string;
  token: string;
  agentId: string;
  name: string;
  tier: NodeTier;
  group?: string;
  reconnectMs: number;
  heartbeatMs: number;
  directiveTimeoutMs: number;
  lastProcessedDirectiveId?: string;
  tlsCert?: string;
  tlsKey?: string;
}

import { getVersion } from '../config/version.ts';
const DEFAULT_DIRECTIVE_TIMEOUT_MS = 300_000;
const MAX_RECONNECT_MS = 30_000;
const MISSED_HEARTBEAT_LIMIT = 3;

const nodeStartTime = Date.now();

let activeDirectiveCount = 0;

async function collectMetrics(): Promise<NodeMetrics> {
  let cpuPercent = 0;
  let memoryMb = 0;
  let memoryTotalMb = 0;
  let diskFreeMb = 0;
  let diskTotalMb = 0;

  try {
    const memText = await Deno.readTextFile('/proc/meminfo');
    const memTotal = memText.match(/MemTotal:\s+(\d+)/);
    const memAvailable = memText.match(/MemAvailable:\s+(\d+)/);
    if (memTotal) memoryTotalMb = Math.round(Number(memTotal[1]) / 1024);
    if (memAvailable) memoryMb = Math.round(Number(memAvailable[1]) / 1024);
    else {
      const memFree = memText.match(/MemFree:\s+(\d+)/);
      if (memFree) memoryMb = Math.round(Number(memFree[1]) / 1024);
    }
  } catch { /* non-linux */ }

  try {
    const statText = await Deno.readTextFile('/proc/stat');
    const cpuLine = statText.split('\n')[0];
    if (cpuLine?.startsWith('cpu ')) {
      const fields = cpuLine.split(/\s+/).slice(1, 8).map(Number);
      const idle = fields[3] ?? 0;
      const total = fields.reduce((a, b) => a + b, 0);
      if (total > 0) cpuPercent = Math.round(((total - idle) / total) * 100);
    }
  } catch { /* non-linux */ }

  try {
    const cmd = new Deno.Command('df', {
      args: ['-B1', Deno.cwd()],
      stdout: 'piped',
      stderr: 'null',
    });
    const result = await cmd.output();
    const dfText = new TextDecoder().decode(result.stdout);
    const dfLine = dfText.split('\n')[1]?.split(/\s+/);
    if (dfLine && dfLine.length >= 4) {
      diskTotalMb = Math.round(Number(dfLine[1]) / (1024 * 1024));
      diskFreeMb = Math.round(Number(dfLine[3]) / (1024 * 1024));
    }
  } catch { /* ignore */ }

  return {
    cpuPercent,
    memoryMb,
    memoryTotalMb,
    diskFreeMb,
    diskTotalMb,
    activeDirectives: activeDirectiveCount,
    uptimeSeconds: Math.floor((Date.now() - nodeStartTime) / 1000),
  };
}

function localPolicyCheck(
  tier: NodeTier,
  toolName: string,
  args: Record<string, unknown>,
): { allowed: boolean; reason: string } {
  if (!isToolAllowedByTier(tier, toolName)) {
    return { allowed: false, reason: `Tool "${toolName}" blocked by tier "${tier}"` };
  }

  if (toolName === 'shell' || toolName === 'code_exec') {
    const command = String(args.command ?? args.code ?? '');
    if (command) {
      const cmdCheck = isCommandAllowedByTier(tier, command);
      if (!cmdCheck.allowed) return cmdCheck;
    }
  }

  const FILE_TOOLS = new Set([
    'file_read',
    'file_write',
    'file_edit',
    'file_patch',
    'file_delete',
    'file_rename',
    'file_list',
    'file_tree',
    'file_info',
    'file_search',
  ]);
  if (FILE_TOOLS.has(toolName)) {
    const pathArg = args.path ?? args.source ?? args.pattern ?? '';
    if (typeof pathArg === 'string' && pathArg) {
      const pathCheck = isPathAllowedByTier(tier, pathArg);
      if (!pathCheck.allowed) return pathCheck;
    }
  }

  return { allowed: true, reason: 'Passed local policy check' };
}

export async function runNodeAgent(opts: NodeAgentOptions): Promise<void> {
  const {
    endpoint,
    token,
    agentId,
    name,
    tier,
    group,
    reconnectMs,
    heartbeatMs,
    directiveTimeoutMs,
    tlsCert,
    tlsKey,
  } = opts;
  let lastProcessedDirectiveId = opts.lastProcessedDirectiveId;

  const activeDirectives = new Map<string, AbortController>();

  function createWebSocket(): WebSocket {
    const url = new URL(endpoint);
    const isSecure = url.protocol === 'wss:' || url.protocol === 'https:';
    const wsUrl = isSecure
      ? endpoint.replace(/^https?:/, 'wss:')
      : endpoint.replace(/^https?:/, 'ws:');

    return new WebSocket(wsUrl);
  }

  async function connect(): Promise<WebSocket> {
    const ws = createWebSocket();
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('WebSocket connection failed'));
    });

    const registerMsg: NodeMessage = {
      type: 'register',
      agentId,
      name,
      token,
      capabilities: [],
      version: await getVersion(),
      tier,
      group,
      lastProcessedDirectiveId,
    };

    ws.send(JSON.stringify(registerMsg));
    return ws;
  }

  let ws: WebSocket | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let missedHeartbeats = 0;
  let currentReconnectMs = reconnectMs;

  function startHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    missedHeartbeats = 0;
    heartbeatTimer = setInterval(async () => {
      if (ws?.readyState === WebSocket.OPEN) {
        missedHeartbeats++;
        const metrics = await collectMetrics();
        ws.send(JSON.stringify(
          {
            type: 'heartbeat',
            agentId,
            metrics,
          } satisfies NodeMessage,
        ));
      }
    }, heartbeatMs);
  }

  async function handleDirective(msg: NodeMessage & { type: 'directive' }) {
    const started = Date.now();
    const timeoutMs = msg.timeoutMs ?? directiveTimeoutMs;
    const abortController = new AbortController();
    activeDirectives.set(msg.id, abortController);
    activeDirectiveCount++;

    try {
      const toolCalls = parseToolCalls(JSON.stringify(msg.params));
      if (toolCalls.length === 0) {
        send({
          type: 'result',
          directiveId: msg.id,
          success: false,
          output: '',
          error: 'No tool calls found in directive',
          durationMs: Date.now() - started,
        });
        return;
      }

      for (const call of toolCalls) {
        if (abortController.signal.aborted) {
          send({
            type: 'result',
            directiveId: msg.id,
            success: false,
            output: '',
            error: 'Directive cancelled',
            durationMs: Date.now() - started,
          });
          return;
        }

        const policyCheck = localPolicyCheck(tier, call.toolName, call.args);
        if (!policyCheck.allowed) {
          send({
            type: 'result',
            directiveId: msg.id,
            success: false,
            output: '',
            error: `Local policy: ${policyCheck.reason}`,
            durationMs: Date.now() - started,
          });
          return;
        }

        const ctx = {
          sessionId: msg.sessionId,
          workingDir: Deno.cwd(),
          agentId,
          workspaceDir: Deno.cwd(),
        };

        let result;
        try {
          const timeoutPromise = new Promise<never>((_, reject) => {
            const timer = setTimeout(() => {
              reject(new Error(`Directive ${msg.id} timed out after ${timeoutMs}ms`));
            }, timeoutMs);
            abortController.signal.addEventListener('abort', () => {
              clearTimeout(timer);
            });
          });

          result = await Promise.race([
            executeTool(call, globalRegistry, ctx),
            timeoutPromise,
          ]);
        } catch (e) {
          result = {
            toolName: call.toolName,
            success: false,
            output: '',
            error: (e as Error).message,
            durationMs: Date.now() - started,
          };
        }

        if (msg.stream && result.output) {
          const chunkSize = 4096;
          for (let i = 0; i < result.output.length; i += chunkSize) {
            if (abortController.signal.aborted) break;
            const chunk = result.output.slice(i, i + chunkSize);
            send({
              type: 'stream_chunk',
              directiveId: msg.id,
              seq: Math.floor(i / chunkSize),
              chunk,
            });
          }
        }

        send({
          type: 'result',
          directiveId: msg.id,
          success: result.success,
          output: result.success ? result.output.slice(0, 50000) : '',
          error: result.error,
          durationMs: Date.now() - started,
        });
      }
    } catch (e) {
      send({
        type: 'result',
        directiveId: msg.id,
        success: false,
        output: '',
        error: (e as Error).message,
        durationMs: Date.now() - started,
      });
    } finally {
      activeDirectives.delete(msg.id);
      activeDirectiveCount--;
      lastProcessedDirectiveId = msg.id;
    }
  }

  function send(data: NodeMessage): void {
    if (ws?.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(data));
      } catch { /* connection may have dropped */ }
    }
  }

  function cancelAllDirectives() {
    for (const [id, ctrl] of activeDirectives) {
      try {
        ctrl.abort(`Node disconnected`);
      } catch { /* */ }
      activeDirectives.delete(id);
    }
    activeDirectiveCount = 0;
  }

  console.error(`[node-agent] Starting node "${name}" (${agentId})`);
  console.error(`[node-agent] Tier: ${tier}  Endpoint: ${endpoint}`);

  while (true) {
    try {
      console.error(`[node-agent] Connecting to ${endpoint}...`);
      ws = await connect();
      console.error(`[node-agent] Connected as ${agentId}`);
      startHeartbeat();
      currentReconnectMs = reconnectMs;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as NodeMessage;

          switch (msg.type) {
            case 'registered':
              console.error(`[node-agent] Registration confirmed`);
              break;

            case 'heartbeat_ack':
              missedHeartbeats = 0;
              if (missedHeartbeats >= MISSED_HEARTBEAT_LIMIT) {
                console.error(`[node-agent] Heartbeat missed limit, reconnecting...`);
                ws?.close();
              }
              break;

            case 'directive':
              handleDirective(msg);
              break;

            case 'cancel': {
              const ctrl = activeDirectives.get(msg.directiveId);
              if (ctrl) {
                ctrl.abort('Cancelled by Hub');
                activeDirectives.delete(msg.directiveId);
                activeDirectiveCount--;
                console.error(`[node-agent] Directive ${msg.directiveId} cancelled by Hub`);
              }
              break;
            }

            case 'config_update':
              console.error(`[node-agent] Config update received from Hub`);
              if (msg.toolsAllowList) {
                console.error(
                  `[node-agent] Tools allow-list updated: ${msg.toolsAllowList.join(', ')}`,
                );
              }
              break;

            case 'rekey': {
              console.error(`[node-agent] Token rotation received`);
              break;
            }

            case 'error':
              console.error(`[node-agent] Hub error: ${msg.message}`);
              break;

            default:
              break;
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        console.error(`[node-agent] Connection closed. Reconnecting in ${currentReconnectMs}ms...`);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = null;
        cancelAllDirectives();
      };

      ws.onerror = () => {
        // onclose will fire next
      };

      await new Promise<void>((resolve) => {
        if (!ws) {
          resolve();
          return;
        }
        ws.onclose = () => {
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          heartbeatTimer = null;
          cancelAllDirectives();
          resolve();
        };
      });
    } catch (e) {
      console.error(`[node-agent] Connection failed: ${(e as Error).message}`);
    }

    await new Promise((resolve) => setTimeout(resolve, currentReconnectMs));
    currentReconnectMs = Math.min(currentReconnectMs * 2, MAX_RECONNECT_MS);
  }
}

export async function runRemoteAgent(opts: {
  endpoint: string;
  token: string;
  agentId: string;
  name: string;
  reconnectMs: number;
  heartbeatMs: number;
}): Promise<void> {
  await runNodeAgent({
    endpoint: opts.endpoint,
    token: opts.token,
    agentId: opts.agentId,
    name: opts.name,
    tier: 'unprivileged',
    reconnectMs: opts.reconnectMs,
    heartbeatMs: opts.heartbeatMs,
    directiveTimeoutMs: DEFAULT_DIRECTIVE_TIMEOUT_MS,
  });
}
