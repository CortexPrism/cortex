import type { NodeMessage, NodeMetrics } from '../remote/types.ts';
import { logEvent } from '../db/lens.ts';
import {
  getDisconnectedNodes,
  getNode,
  updateLastDirective,
  updateNodeStatus,
  validateNodeToken,
} from './node-registry.ts';
import type { NodeTier } from './node-registry.ts';
import { validateNodeDirective } from '../security/validator.ts';
import { cancelPending, registerPending, routeResult } from './session-routing.ts';

export type NodeEventType = 'node.connected' | 'node.disconnected' | 'node.error';

export interface NodeEvent {
  type: NodeEventType;
  nodeId: string;
  nodeName?: string;
  tier?: NodeTier;
  reason?: string;
  error?: string;
  ts: string;
}

type NodeEventHandler = (event: NodeEvent) => void | Promise<void>;

const nodeEventHandlers = new Map<NodeEventType, Set<NodeEventHandler>>();

export function onNodeEvent(type: NodeEventType, handler: NodeEventHandler): void {
  if (!nodeEventHandlers.has(type)) {
    nodeEventHandlers.set(type, new Set());
  }
  nodeEventHandlers.get(type)!.add(handler);
}

export function offNodeEvent(type: NodeEventType, handler: NodeEventHandler): void {
  nodeEventHandlers.get(type)?.delete(handler);
}

async function emitNodeEvent(event: NodeEvent): Promise<void> {
  const handlers = nodeEventHandlers.get(event.type);
  if (!handlers) return;
  for (const fn of handlers) {
    try {
      await fn(event);
    } catch { /* handler error, don't break the chain */ }
  }
}

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 3 * HEARTBEAT_INTERVAL_MS;

interface NodeConnection {
  agentId: string;
  ws: WebSocket;
  tier: NodeTier;
  connectedAt: string;
  lastHeartbeatAck: string;
}

const nodeConnections = new Map<string, NodeConnection>();

let healthCheckTimer: ReturnType<typeof setInterval> | null = null;

function send(ws: WebSocket, data: NodeMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(data));
    } catch { /* connection may have dropped */ }
  }
}

export function getConnectedNodeWs(agentId: string): WebSocket | undefined {
  const conn = nodeConnections.get(agentId);
  if (conn && conn.ws.readyState === WebSocket.OPEN) {
    return conn.ws;
  }
  return undefined;
}

export function getConnectedNodes(): string[] {
  return [...nodeConnections.keys()];
}

export function getNodeConnectionCount(): number {
  return nodeConnections.size;
}

async function handleRegister(
  ws: WebSocket,
  msg: NodeMessage & { type: 'register' },
): Promise<void> {
  const { agentId, name, token, capabilities, version, tier, group, lastProcessedDirectiveId } =
    msg;

  const valid = await validateNodeToken(agentId, token);
  if (!valid) {
    send(ws, { type: 'error', message: 'Invalid token', code: 'AUTH_FAILED' });
    ws.close(4001, 'Authentication failed');
    return;
  }

  const existing = nodeConnections.get(agentId);
  if (existing) {
    try {
      existing.ws.close(4002, 'Duplicate registration');
    } catch { /* already closing */ }
    nodeConnections.delete(agentId);
  }

  const now = new Date().toISOString();

  const node = await getNode(agentId);
  const nodeTier: NodeTier = (tier as NodeTier) ?? node?.tier ?? 'unprivileged';

  nodeConnections.set(agentId, {
    agentId,
    ws,
    tier: nodeTier,
    connectedAt: now,
    lastHeartbeatAck: now,
  });

  await updateNodeStatus(agentId, 'connected', now);

  if (node) {
    if (version) {
      const db = await (await import('../db/client.ts')).getCoreDb();
      await db.run(`UPDATE nodes SET version = ?, updated_at = ? WHERE id = ?`, [
        version,
        now,
        agentId,
      ]);
    }

    if (lastProcessedDirectiveId) {
      await updateLastDirective(agentId, lastProcessedDirectiveId);
    }

    if (capabilities?.length) {
      const db = await (await import('../db/client.ts')).getCoreDb();
      await db.run(`UPDATE nodes SET capabilities = ?, updated_at = ? WHERE id = ?`, [
        JSON.stringify(capabilities),
        now,
        agentId,
      ]);
    }
  }

  send(ws, { type: 'registered', agentId });

  await logEvent({
    event_type: 'node_connected',
    session_id: 'system',
    actor: agentId,
    action: 'node_register',
    summary: `Node "${name}" registered and connected`,
    started_at: now,
    payload: { nodeId: agentId, name, capabilities, version, tier, group },
  });

  emitNodeEvent({
    type: 'node.connected',
    nodeId: agentId,
    nodeName: name,
    tier: nodeTier,
    ts: now,
  });

  startHealthCheckLoop();
}

async function handleHeartbeat(
  ws: WebSocket,
  msg: NodeMessage & { type: 'heartbeat' },
): Promise<void> {
  const { agentId, metrics } = msg;
  const conn = nodeConnections.get(agentId);

  if (!conn) {
    send(ws, { type: 'error', message: 'Not registered', code: 'NOT_REGISTERED' });
    return;
  }

  const now = new Date().toISOString();
  conn.lastHeartbeatAck = now;

  await updateNodeStatus(agentId, 'connected', now);

  send(ws, { type: 'heartbeat_ack', agentId });

  if (metrics) {
    await logEvent({
      event_type: 'node_heartbeat',
      session_id: 'system',
      actor: agentId,
      action: 'heartbeat',
      summary:
        `Node heartbeat — CPU: ${metrics.cpuPercent}%, Mem: ${metrics.memoryMb}MB, Disk: ${metrics.diskFreeMb}MB free`,
      started_at: now,
      payload: metrics as unknown as Record<string, unknown>,
    });
  }
}

async function handleResult(
  ws: WebSocket,
  msg: NodeMessage & { type: 'result' },
): Promise<void> {
  const { directiveId, success, output, error, durationMs } = msg;
  const now = new Date().toISOString();

  const pending = pendingDirectives.get(directiveId);
  if (pending) {
    clearTimeout(pending.timer);
    pendingDirectives.delete(directiveId);
    pending.resolve({ success, output, error, durationMs });
  }

  routeResult(directiveId, { success, output, error, durationMs });

  await logEvent({
    event_type: 'node_directive',
    session_id: pending?.sessionId ?? 'system',
    actor: 'node',
    action: success ? 'directive_completed' : 'directive_failed',
    summary: `Directive ${directiveId}: ${success ? 'success' : 'failed'} (${durationMs}ms)`,
    started_at: now,
    payload: { directiveId, success, output: output.slice(0, 500), error },
    duration_ms: durationMs,
  });
}

async function handleStreamChunk(
  _ws: WebSocket,
  msg: NodeMessage & { type: 'stream_chunk' },
): Promise<void> {
  await logEvent({
    event_type: 'node_stream_chunk',
    session_id: 'system',
    actor: 'node',
    action: 'stream_chunk',
    summary: `Stream chunk for directive ${msg.directiveId} seq=${msg.seq}`,
    started_at: new Date().toISOString(),
    payload: { directiveId: msg.directiveId, seq: msg.seq, chunkSize: msg.chunk.length },
  });
}

async function handleDisconnect(
  ws: WebSocket,
  msg: NodeMessage & { type: 'disconnect' },
): Promise<void> {
  const agentId = findAgentIdByWs(ws);
  if (!agentId) return;

  nodeConnections.delete(agentId);
  await updateNodeStatus(agentId, 'disconnected');

  rejectPendingForNode(agentId, 'Node disconnected');

  await logEvent({
    event_type: 'node_disconnected',
    session_id: 'system',
    actor: agentId,
    action: 'node_disconnect',
    summary: `Node disconnected: ${msg.reason}`,
    started_at: new Date().toISOString(),
    payload: { reason: msg.reason },
  });

  emitNodeEvent({
    type: 'node.disconnected',
    nodeId: agentId,
    reason: msg.reason,
    ts: new Date().toISOString(),
  });
}

async function checkHealth(): Promise<void> {
  const now = new Date().toISOString();
  for (const [agentId, conn] of nodeConnections) {
    const lastAck = new Date(conn.lastHeartbeatAck);
    const elapsed = Date.now() - lastAck.getTime();
    if (elapsed > HEARTBEAT_TIMEOUT_MS) {
      nodeConnections.delete(agentId);
      try {
        conn.ws.close();
      } catch { /* gone */ }
      rejectPendingForNode(agentId, `Node heartbeat timeout after ${Math.round(elapsed / 1000)}s`);
      await updateNodeStatus(agentId, 'disconnected');
      await logEvent({
        event_type: 'node_disconnected',
        session_id: 'system',
        actor: agentId,
        action: 'node_heartbeat_timeout',
        summary: `Node marked disconnected due to heartbeat timeout (${
          Math.round(elapsed / 1000)
        }s)`,
        started_at: now,
      });
      emitNodeEvent({
        type: 'node.disconnected',
        nodeId: agentId,
        reason: `heartbeat timeout after ${Math.round(elapsed / 1000)}s`,
        ts: now,
      });
    }
  }

  const staleNodes = await getDisconnectedNodes(HEARTBEAT_TIMEOUT_MS);
  for (const node of staleNodes) {
    if (!nodeConnections.has(node.id)) {
      await updateNodeStatus(node.id, 'disconnected');
    }
  }

  if (nodeConnections.size === 0) {
    if (healthCheckTimer) {
      clearInterval(healthCheckTimer);
      healthCheckTimer = null;
    }
  }
}

function startHealthCheckLoop(): void {
  if (healthCheckTimer) return;
  healthCheckTimer = setInterval(checkHealth, 10_000);
}

function rejectPendingForNode(nodeId: string, reason: string) {
  for (const [directiveId, pending] of pendingDirectives) {
    if (pending.nodeId === nodeId) {
      clearTimeout(pending.timer);
      pendingDirectives.delete(directiveId);
      cancelPending(directiveId);
      pending.reject(new Error(reason));
    }
  }
}

function findAgentIdByWs(ws: WebSocket): string | undefined {
  for (const [id, conn] of nodeConnections) {
    if (conn.ws === ws) return id;
  }
  return undefined;
}

export function handleNodeWebSocket(req: Request): Response {
  const { socket: ws, response } = Deno.upgradeWebSocket(req);

  ws.onopen = () => {
    // Node must send register first
  };

  ws.onmessage = async (event: MessageEvent) => {
    let msg: NodeMessage;
    try {
      msg = JSON.parse(event.data as string) as NodeMessage;
    } catch {
      send(ws, { type: 'error', message: 'Invalid JSON', code: 'PARSE_ERROR' });
      return;
    }

    try {
      switch (msg.type) {
        case 'register':
          await handleRegister(ws, msg);
          break;
        case 'heartbeat':
          await handleHeartbeat(ws, msg);
          break;
        case 'result':
          await handleResult(ws, msg);
          break;
        case 'stream_chunk':
          await handleStreamChunk(ws, msg);
          break;
        case 'disconnect':
          await handleDisconnect(ws, msg);
          break;
        default:
          send(ws, {
            type: 'error',
            message: `Unknown message type: ${(msg as { type: string }).type}`,
            code: 'UNKNOWN_TYPE',
          });
      }
    } catch (e) {
      send(ws, { type: 'error', message: (e as Error).message, code: 'INTERNAL_ERROR' });
      const agentId = findAgentIdByWs(ws);
      if (agentId) {
        emitNodeEvent({
          type: 'node.error',
          nodeId: agentId,
          error: (e as Error).message,
          ts: new Date().toISOString(),
        });
      }
    }
  };

  ws.onclose = async () => {
    const agentId = findAgentIdByWs(ws);
    if (agentId) {
      nodeConnections.delete(agentId);
      await updateNodeStatus(agentId, 'disconnected');
      rejectPendingForNode(agentId, 'Node WebSocket connection closed');
      const now = new Date().toISOString();
      await logEvent({
        event_type: 'node_disconnected',
        session_id: 'system',
        actor: agentId,
        action: 'node_ws_closed',
        summary: 'Node WebSocket connection closed',
        started_at: now,
      });
      emitNodeEvent({
        type: 'node.disconnected',
        nodeId: agentId,
        reason: 'WebSocket connection closed',
        ts: now,
      });
    }
  };

  ws.onerror = (_e: Event | ErrorEvent) => {
    // onclose will fire next and handle cleanup
  };

  return response;
}

export interface DispatchResult {
  dispatched: boolean;
  reason?: string;
}

export interface DirectivePending {
  sessionId: string;
  directiveId: string;
  nodeId: string;
  resolve: (
    result: { success: boolean; output: string; error?: string; durationMs: number },
  ) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const pendingDirectives = new Map<string, DirectivePending>();

export function getPendingCount(): number {
  return pendingDirectives.size;
}

export async function dispatchDirective(
  agentId: string,
  directive: {
    id: string;
    sessionId: string;
    action: string;
    params: Record<string, unknown>;
    stream?: boolean;
    timeoutMs?: number;
  },
): Promise<DispatchResult> {
  const conn = nodeConnections.get(agentId);
  if (!conn || conn.ws.readyState !== WebSocket.OPEN) {
    return { dispatched: false, reason: 'Node not connected' };
  }

  // Validate directive against node's tier and global policies
  const validation = await validateNodeDirective(
    agentId,
    conn.tier,
    directive.action,
    directive.params,
    directive.sessionId,
  );

  if (!validation.allowed) {
    return { dispatched: false, reason: validation.reason };
  }

  send(conn.ws, {
    type: 'directive',
    id: directive.id,
    sessionId: directive.sessionId,
    action: directive.action,
    params: directive.params,
    stream: directive.stream,
    timeoutMs: directive.timeoutMs,
  });

  await logEvent({
    event_type: 'node_directive_dispatched',
    session_id: directive.sessionId,
    actor: 'hub',
    action: 'directive_dispatched',
    summary: `Directive ${directive.id} dispatched to node ${agentId}`,
    started_at: new Date().toISOString(),
    payload: { nodeId: agentId, directiveId: directive.id, action: directive.action },
  });

  return { dispatched: true };
}

export function dispatchAndWait(
  agentId: string,
  directive: {
    id: string;
    sessionId: string;
    action: string;
    params: Record<string, unknown>;
    stream?: boolean;
    timeoutMs?: number;
  },
  defaultTimeoutMs = 120_000,
): Promise<{ success: boolean; output: string; error?: string; durationMs: number }> {
  return new Promise((resolve, reject) => {
    const conn = nodeConnections.get(agentId);
    if (!conn || conn.ws.readyState !== WebSocket.OPEN) {
      reject(new Error('Node not connected'));
      return;
    }

    const timeoutMs = directive.timeoutMs ?? defaultTimeoutMs;
    const timer = setTimeout(() => {
      pendingDirectives.delete(directive.id);
      reject(new Error(`Directive ${directive.id} timed out after ${timeoutMs}ms`));
    }, timeoutMs + 5000);

    const pending: DirectivePending = {
      sessionId: directive.sessionId,
      directiveId: directive.id,
      nodeId: agentId,
      resolve,
      reject,
      timer,
    };

    pendingDirectives.set(directive.id, pending);

    registerPending(directive.id, directive.sessionId, agentId);

    dispatchDirective(agentId, directive).then((result) => {
      if (!result.dispatched) {
        clearTimeout(timer);
        pendingDirectives.delete(directive.id);
        cancelPending(directive.id);
        reject(new Error(result.reason ?? 'Dispatch failed'));
      }
    }).catch((e) => {
      clearTimeout(timer);
      pendingDirectives.delete(directive.id);
      cancelPending(directive.id);
      reject(e);
    });
  });
}

export async function cancelDirective(agentId: string, directiveId: string): Promise<boolean> {
  const conn = nodeConnections.get(agentId);
  if (!conn || conn.ws.readyState !== WebSocket.OPEN) return false;

  send(conn.ws, { type: 'cancel', directiveId });
  return true;
}

export async function pushConfigUpdate(
  agentId: string,
  update: { policies?: Record<string, unknown>; toolsAllowList?: string[] },
): Promise<boolean> {
  const conn = nodeConnections.get(agentId);
  if (!conn || conn.ws.readyState !== WebSocket.OPEN) return false;

  send(conn.ws, { type: 'config_update', agentId, ...update });
  return true;
}

export async function pushRekey(agentId: string, newToken: string): Promise<boolean> {
  const conn = nodeConnections.get(agentId);
  if (!conn || conn.ws.readyState !== WebSocket.OPEN) return false;

  send(conn.ws, { type: 'rekey', agentId, newToken });
  return true;
}
