/**
 * Remote Kernel — Cross-instance extensions for OsKernel.
 *
 * Extends the kernel's process tree and resource accounting to span
 * across swarm nodes. Remote processes are tracked as proxy entries
 * in the local process tree, and resources are aggregated across
 * all connected nodes.
 */
import { kernel, type KernelRole, type ProcessTreeNode } from '../kernel/mod.ts';
import { listNodes } from './node-registry.ts';
import type { SwarmNodeId } from '../../contracts/swarm.ts';

export interface RemoteProcessEntry {
  pid: number;
  parentPid: number;
  agentId: string;
  sessionId: string;
  role: KernelRole;
  agentType?: string;
  status: 'running' | 'exited';
  startedAt: number;
  nodeId: SwarmNodeId;
}

export interface AggregatedResourceEntry {
  agentId: string;
  pid: number;
  toolCalls: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  cpuMs: number;
  peakMemoryMb: number;
  lastUpdated: number;
  nodeId: SwarmNodeId;
}

const remoteProcesses = new Map<number, RemoteProcessEntry>();
const aggregatedResources = new Map<SwarmNodeId, AggregatedResourceEntry[]>();
let nextRemotePid = 900_000;

function allocateRemotePid(): number {
  return nextRemotePid++;
}

/**
 * Register a remote process in the local kernel's process tree.
 * This makes remote sub-agents appear in the local process tree display.
 */
export function registerRemoteProcess(
  entry: Omit<RemoteProcessEntry, 'pid' | 'status' | 'startedAt'>,
): number {
  const pid = allocateRemotePid();
  remoteProcesses.set(pid, {
    ...entry,
    pid,
    status: 'running',
    startedAt: Date.now(),
  });

  kernel.registerProcess({
    pid,
    parentPid: entry.parentPid || 0,
    agentId: `${entry.nodeId}/${entry.agentId}`,
    sessionId: entry.sessionId,
    role: entry.role,
    agentType: entry.agentType ?? 'remote',
  });

  return pid;
}

/** Mark a remote process as exited. */
export function unregisterRemoteProcess(pid: number): void {
  remoteProcesses.delete(pid);
  kernel.unregisterProcess(pid);
}

/** Get all remote processes for a given node. */
export function getRemoteProcessesForNode(nodeId: SwarmNodeId): RemoteProcessEntry[] {
  return [...remoteProcesses.values()].filter((p) => p.nodeId === nodeId);
}

/** Get the full process tree including remote processes. */
export function getFullProcessTree(): ProcessTreeNode[] {
  return kernel.getProcessTreeForDisplay();
}

/**
 * Sync resource accounting from a remote node.
 * Aggregates the remote node's resource usage into the local kernel.
 */
export function syncRemoteResources(
  nodeId: SwarmNodeId,
  resources: Array<{
    agentId: string;
    toolCalls: number;
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
    cpuMs: number;
    peakMemoryMb: number;
  }>,
): void {
  const entries: AggregatedResourceEntry[] = resources.map((r) => ({
    ...r,
    pid: allocateRemotePid(),
    lastUpdated: Date.now(),
    nodeId,
  }));
  aggregatedResources.set(nodeId, entries);

  for (const entry of entries) {
    kernel.recordTokens(
      `${nodeId}/${entry.agentId}`,
      entry.tokensIn,
      entry.tokensOut,
      entry.costUsd,
    );
  }
}

/**
 * Get the aggregated resource report across all swarm nodes
 * (local + all remote).
 */
export function getAggregatedResources(): {
  local: ReturnType<typeof kernel.getAllResources>;
  remote: Map<SwarmNodeId, AggregatedResourceEntry[]>;
  total: {
    toolCalls: number;
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
    cpuMs: number;
    peakMemoryMb: number;
  };
} {
  const local = kernel.getAllResources();

  let total = {
    toolCalls: 0,
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    cpuMs: 0,
    peakMemoryMb: 0,
  };

  for (const r of local) {
    total.toolCalls += r.toolCalls;
    total.tokensIn += r.tokensIn;
    total.tokensOut += r.tokensOut;
    total.costUsd += r.costUsd;
    total.cpuMs += r.cpuMs;
    total.peakMemoryMb = Math.max(total.peakMemoryMb, r.peakMemoryMb);
  }

  for (const [, entries] of aggregatedResources) {
    for (const r of entries) {
      total.toolCalls += r.toolCalls;
      total.tokensIn += r.tokensIn;
      total.tokensOut += r.tokensOut;
      total.costUsd += r.costUsd;
      total.cpuMs += r.cpuMs;
      total.peakMemoryMb = Math.max(total.peakMemoryMb, r.peakMemoryMb);
    }
  }

  return { local, remote: aggregatedResources, total };
}

/**
 * Get all online swarm nodes, combining local kernel info with registry data.
 */
export async function getSwarmTopology(): Promise<
  Array<{
    nodeId: SwarmNodeId;
    name: string;
    isSelf: boolean;
    processCount: number;
    remoteProcessCount: number;
    tokenUsage: { in: number; out: number; cost: number };
  }>
> {
  const nodes = await listNodes();
  const localResources = kernel.getAllResources();
  const localTokens = localResources.reduce(
    (acc, r) => ({
      in: acc.in + r.tokensIn,
      out: acc.out + r.tokensOut,
      cost: acc.cost + r.costUsd,
    }),
    { in: 0, out: 0, cost: 0 },
  );

  return nodes.map((n) => {
    const isSelf = kernel.getProcessTree().some(
      (p) => p.agentId === n.name,
    );
    const remoteRes = aggregatedResources.get(n.nodeId) ?? [];
    const remoteTokens = remoteRes.reduce(
      (acc, r) => ({
        in: acc.in + r.tokensIn,
        out: acc.out + r.tokensOut,
        cost: acc.cost + r.costUsd,
      }),
      { in: 0, out: 0, cost: 0 },
    );

    return {
      nodeId: n.nodeId,
      name: n.name,
      isSelf,
      processCount: isSelf ? kernel.getProcessTree().length : remoteRes.length,
      remoteProcessCount: remoteProcesses.size,
      tokenUsage: isSelf ? localTokens : remoteTokens,
    };
  });
}

/** Initialize the remote kernel subsystem. */
export function initRemoteKernel(): void {
  // Ensure nextRemotePid doesn't collide with existing local PIDs
  const existingPids = kernel.getProcessTree().map((p) => p.pid);
  const maxExisting = existingPids.length > 0 ? Math.max(...existingPids) : 0;
  nextRemotePid = Math.max(900_000, maxExisting + 1000);
}
