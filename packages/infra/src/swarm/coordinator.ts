/**
 * Swarm Coordinator — Cross-instance task delegation and resource aggregation.
 *
 * Sits above the A2A transport layer and provides the primary API for
 * distributed agent swarm operations: registering this instance, discovering
 * peers, dispatching directives, and aggregating resource usage.
 */
import { getCoreDb } from '../../../../src/db/client.ts';
import { kernel } from '../kernel/mod.ts';
import { createSwarmTransport } from './transport.ts';
import {
  getNode,
  heartbeat as sendHeartbeat,
  HEARTBEAT_INTERVAL_MS,
  listNodes,
  markNodesOffline,
  registerNode,
  updateNodeStatus,
} from './node-registry.ts';
import type {
  ISwarmCoordinator,
  ISwarmNode,
  ISwarmTransport,
  NodeMetrics,
  NodeStatus,
  SwarmDirective,
  SwarmDirectiveResult,
  SwarmNodeId,
  SwarmNodeRegistration,
  SwarmResourceReport,
} from '../../contracts/swarm.ts';

let selfNodeId: SwarmNodeId | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let transportLayer: ISwarmTransport | null = null;

function getTransport(): ISwarmTransport {
  if (!transportLayer) transportLayer = createSwarmTransport();
  return transportLayer;
}

function generateDirectiveId(): string {
  return `dir_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function initSwarmCoordinator(reg: SwarmNodeRegistration): Promise<SwarmNodeId> {
  const nodeId = await registerNode(reg);
  selfNodeId = nodeId;
  getTransport();
  startHeartbeat();
  return nodeId;
}

export async function shutdownSwarmCoordinator(): Promise<void> {
  stopHeartbeat();
  if (selfNodeId) {
    await updateNodeStatus(selfNodeId, 'offline');
    selfNodeId = null;
  }
  transportLayer = null;
}

function startHeartbeat(): void {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(async () => {
    if (!selfNodeId) return;
    try {
      const resources = kernel.getAllResources();
      const totalTokens = resources.reduce(
        (acc, r) => ({
          in: acc.in + r.tokensIn,
          out: acc.out + r.tokensOut,
          cost: acc.cost + r.costUsd,
        }),
        { in: 0, out: 0, cost: 0 },
      );
      const memoryInfo = getSystemMemory();

      await sendHeartbeat(selfNodeId, {
        cpuPercent: getCpuUsage(),
        memoryUsedMb: memoryInfo.usedMb,
        memoryTotalMb: memoryInfo.totalMb,
        diskUsedMb: 0,
        diskTotalMb: 0,
        activeSessions: resources.length,
        activeProcesses: kernel.getProcessTree().length,
        tokensUsedToday: totalTokens.in,
        tokensOutToday: totalTokens.out,
        costUsdToday: totalTokens.cost,
        uptimeSeconds: Math.floor(Deno.osUptime()),
      });
    } catch {
      // Heartbeat failures are non-fatal — offline detection handles stale nodes
    }
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function getCpuUsage(): number {
  try {
    const loadAvg = Deno.loadavg?.();
    if (loadAvg && loadAvg.length > 0) return loadAvg[0];
  } catch { /* not available on all platforms */ }
  return 0;
}

function getSystemMemory(): { usedMb: number; totalMb: number } {
  try {
    const mem = Deno.systemMemoryInfo?.();
    if (mem) {
      const used = mem.total - mem.free;
      return { usedMb: used / (1024 * 1024), totalMb: mem.total / (1024 * 1024) };
    }
  } catch { /* not available on all platforms */ }
  return { usedMb: 0, totalMb: 0 };
}

export const swarm: ISwarmCoordinator = {
  async registerSelf(reg: SwarmNodeRegistration): Promise<void> {
    await initSwarmCoordinator(reg);
  },

  async discoverPeers(): Promise<ISwarmNode[]> {
    const nodes = await listNodes();
    await markNodesOffline();
    return nodes.filter((n) => n.nodeId !== selfNodeId);
  },

  async getNode(nodeId: SwarmNodeId): Promise<ISwarmNode | null> {
    return getNode(nodeId);
  },

  async listNodes(status?: NodeStatus): Promise<ISwarmNode[]> {
    return listNodes(status);
  },

  async dispatch(
    directive: Omit<SwarmDirective, 'directiveId' | 'createdAt' | 'expiresAt'>,
  ): Promise<SwarmDirectiveResult> {
    const directiveId = generateDirectiveId();
    const now = new Date().toISOString();

    const fullDirective: SwarmDirective = {
      ...directive,
      directiveId,
      createdAt: now,
      expiresAt: new Date(Date.now() + directive.ttlMs).toISOString(),
    };

    const db = await getCoreDb();
    await db.run(
      `INSERT INTO swarm_directives
       (id, directive_id, source_node_id, target_node_id, kind, payload, priority, status,
        ttl_ms, dispatched_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'dispatched', ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        directiveId,
        fullDirective.sourceNodeId,
        fullDirective.targetNodeId,
        fullDirective.kind,
        JSON.stringify(fullDirective.payload),
        fullDirective.priority,
        fullDirective.ttlMs,
        now,
        now,
        now,
      ],
    );

    const transport = getTransport();
    const result = await transport.sendDirective(fullDirective.targetNodeId, fullDirective);

    await db.run(
      `UPDATE swarm_directives
       SET status = ?, output = ?, error = ?, tokens_in = ?, tokens_out = ?,
           cost_usd = ?, duration_ms = ?, tool_calls = ?, completed_at = ?, updated_at = ?
       WHERE directive_id = ?`,
      [
        result.status,
        result.output ?? null,
        result.error ?? null,
        result.metrics?.tokensIn ?? 0,
        result.metrics?.tokensOut ?? 0,
        result.metrics?.costUsd ?? 0,
        result.metrics?.durationMs ?? 0,
        result.metrics?.toolCalls ?? 0,
        result.completedAt,
        now,
        directiveId,
      ],
    );

    return result;
  },

  async broadcast(
    directive: Omit<SwarmDirective, 'directiveId' | 'createdAt' | 'expiresAt' | 'targetNodeId'>,
    group?: string,
  ): Promise<SwarmDirectiveResult[]> {
    let nodes = await listNodes('connected');
    nodes = nodes.filter((n) => n.nodeId !== selfNodeId);

    if (group) {
      nodes = nodes.filter((n) => n.group === group);
    }

    if (nodes.length === 0) return [];

    const transport = getTransport();
    return transport.broadcastDirective(
      nodes.map((n) => n.nodeId),
      {
        ...directive,
        directiveId: generateDirectiveId(),
        targetNodeId: '',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
      },
    );
  },

  async getResourceReport(): Promise<SwarmResourceReport> {
    const db = await getCoreDb();
    const nodes = await listNodes();
    const onlineNodes = nodes.filter((n) => n.status === 'connected');

    const snapshots = await db.all<{
      node_id: string;
      tokens_in: number;
      tokens_out: number;
      cost_usd: number;
      tool_calls: number;
      cpu_ms: number;
      memory_used_mb: number;
      active_sessions: number;
      active_processes: number;
    }>(
      `SELECT node_id,
              MAX(tokens_in) AS tokens_in,
              MAX(tokens_out) AS tokens_out,
              MAX(cost_usd) AS cost_usd,
              MAX(tool_calls) AS tool_calls,
              MAX(cpu_ms) AS cpu_ms,
              MAX(memory_used_mb) AS memory_used_mb,
              MAX(active_sessions) AS active_sessions,
              MAX(active_processes) AS active_processes
       FROM swarm_resource_snapshots
       WHERE snapshot_at >= datetime('now', '-1 day')
       GROUP BY node_id`,
    );

    const perNode: SwarmResourceReport['perNode'] = {};
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let totalCostUsd = 0;
    let totalToolCalls = 0;
    let totalCpuMs = 0;
    let totalPeakMemoryMb = 0;

    for (const s of snapshots) {
      const info = {
        tokensIn: s.tokens_in,
        tokensOut: s.tokens_out,
        costUsd: s.cost_usd,
        toolCalls: s.tool_calls,
        cpuMs: s.cpu_ms,
        peakMemoryMb: s.memory_used_mb,
        activeSessions: s.active_sessions,
        activeProcesses: s.active_processes,
      };
      perNode[s.node_id] = info;
      totalTokensIn += s.tokens_in;
      totalTokensOut += s.tokens_out;
      totalCostUsd += s.cost_usd;
      totalToolCalls += s.tool_calls;
      totalCpuMs += s.cpu_ms;
      totalPeakMemoryMb = Math.max(totalPeakMemoryMb, s.memory_used_mb);
    }

    return {
      totalNodes: nodes.length,
      onlineNodes: onlineNodes.length,
      totalTokensIn,
      totalTokensOut,
      totalCostUsd,
      totalToolCalls,
      totalCpuMs,
      totalPeakMemoryMb,
      perNode,
    };
  },

  async heartbeat(): Promise<void> {
    if (!selfNodeId) return;
    try {
      const resources = kernel.getAllResources();
      const totalTokens = resources.reduce(
        (acc, r) => ({
          in: acc.in + r.tokensIn,
          out: acc.out + r.tokensOut,
          cost: acc.cost + r.costUsd,
        }),
        { in: 0, out: 0, cost: 0 },
      );
      const memoryInfo = getSystemMemory();

      await sendHeartbeat(selfNodeId, {
        cpuPercent: getCpuUsage(),
        memoryUsedMb: memoryInfo.usedMb,
        memoryTotalMb: memoryInfo.totalMb,
        diskUsedMb: 0,
        diskTotalMb: 0,
        activeSessions: resources.length,
        activeProcesses: kernel.getProcessTree().length,
        tokensUsedToday: totalTokens.in,
        tokensOutToday: totalTokens.out,
        costUsdToday: totalTokens.cost,
        uptimeSeconds: Math.floor(Deno.osUptime()),
      });
    } catch { /* best effort */ }
  },

  async drain(): Promise<void> {
    if (!selfNodeId) return;
    await updateNodeStatus(selfNodeId, 'draining');
  },

  async seal(): Promise<void> {
    if (!selfNodeId) return;
    await updateNodeStatus(selfNodeId, 'sealed');
    stopHeartbeat();
  },
};
