/**
 * Distributed Agent Swarm — Contracts
 *
 * Cross-instance coordination layer for CortexPrism.
 * Uses A2A protocol as the wire transport between nodes.
 */

import type { CapabilityGroup } from '../../../src/tools/types.ts';

/** Unique identifier for a swarm node (Cortex instance). */
export type SwarmNodeId = string;

/** Node capability tier — matches kernel RBAC roles. */
export type NodeTier = 'root' | 'sudo' | 'unprivileged';

/** Current lifecycle state of a swarm node.
 *  These values are mapped to the `nodes` table's CHECK constraint
 *  ('connecting','connected','disconnected','error','deregistered') in node-registry.ts.
 *  `online`→`connected`, `offline`→`disconnected`, `draining`→`connected`, `sealed`→`disconnected`. */
export type NodeStatus =
  | 'online'
  | 'offline'
  | 'connected'
  | 'disconnected'
  | 'degraded'
  | 'draining'
  | 'sealed';

/** Runtime metrics reported by a node during heartbeat. */
export interface NodeMetrics {
  cpuPercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  diskUsedMb: number;
  diskTotalMb: number;
  activeSessions: number;
  activeProcesses: number;
  tokensUsedToday: number;
  tokensOutToday: number;
  costUsdToday: number;
  uptimeSeconds: number;
}

/** A registered swarm node (Cortex instance). */
export interface ISwarmNode {
  nodeId: SwarmNodeId;
  name: string;
  host: string;
  port: number;
  tier: NodeTier;
  group?: string;
  status: NodeStatus;
  capabilities: CapabilityGroup[];
  a2aEndpoint: string;
  agentCard?: Record<string, unknown>;
  metrics: NodeMetrics;
  labels: Record<string, string>;
  registeredAt: string;
  lastHeartbeatAt: string;
  lastSeenAt: string;
}

/** Registration payload sent by a node to the swarm registry. */
export interface SwarmNodeRegistration {
  nodeId?: SwarmNodeId;
  name: string;
  host: string;
  port: number;
  tier?: NodeTier;
  group?: string;
  capabilities?: CapabilityGroup[];
  a2aEndpoint?: string;
  labels?: Record<string, string>;
}

/** Swarm directive — a task dispatched to a remote node. */
export interface SwarmDirective {
  directiveId: string;
  sourceNodeId: SwarmNodeId;
  targetNodeId: SwarmNodeId;
  kind: 'spawn_agent' | 'execute_task' | 'query_resources' | 'forward_message' | 'sync_state';
  payload: Record<string, unknown>;
  priority: 'low' | 'normal' | 'high' | 'critical';
  ttlMs: number;
  createdAt: string;
  expiresAt: string;
  parentDirectiveId?: string;
}

/** Result of a completed directive. */
export interface SwarmDirectiveResult {
  directiveId: string;
  nodeId: SwarmNodeId;
  status: 'completed' | 'failed' | 'cancelled' | 'timed_out';
  output?: string;
  error?: string;
  metrics?: {
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
    durationMs: number;
    toolCalls: number;
  };
  completedAt: string;
}

/** Aggregated resource accounting across all nodes. */
export interface SwarmResourceReport {
  totalNodes: number;
  onlineNodes: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCostUsd: number;
  totalToolCalls: number;
  totalCpuMs: number;
  totalPeakMemoryMb: number;
  perNode: Record<SwarmNodeId, {
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
    toolCalls: number;
    cpuMs: number;
    peakMemoryMb: number;
    activeSessions: number;
    activeProcesses: number;
  }>;
}

/** Swarm coordinator interface. */
export interface ISwarmCoordinator {
  /** Register this instance as a swarm node. */
  registerSelf(reg: SwarmNodeRegistration): Promise<void>;
  /** Discover peer nodes via A2A agent cards or shared registry. */
  discoverPeers(): Promise<ISwarmNode[]>;
  /** Get a known peer node. */
  getNode(nodeId: SwarmNodeId): Promise<ISwarmNode | null>;
  /** List all known nodes. */
  listNodes(status?: NodeStatus): Promise<ISwarmNode[]>;
  /** Send a directive to a remote node and await result. */
  dispatch(
    directive: Omit<SwarmDirective, 'directiveId' | 'createdAt' | 'expiresAt'>,
  ): Promise<SwarmDirectiveResult>;
  /** Broadcast a directive to all online nodes in a group. */
  broadcast(
    directive: Omit<SwarmDirective, 'directiveId' | 'createdAt' | 'expiresAt' | 'targetNodeId'>,
    group?: string,
  ): Promise<SwarmDirectiveResult[]>;
  /** Get the aggregated resource report across the swarm. */
  getResourceReport(): Promise<SwarmResourceReport>;
  /** Send heartbeat and update local metrics. */
  heartbeat(): Promise<void>;
  /** Drain this node (stop accepting new work). */
  drain(): Promise<void>;
  /** Seal this node (graceful shutdown, complete in-flight work). */
  seal(): Promise<void>;
}

/** Swarm transport — abstracts the wire protocol between nodes. */
export interface ISwarmTransport {
  /** Connect to a remote node. */
  connect(node: ISwarmNode): Promise<void>;
  /** Disconnect from a remote node. */
  disconnect(nodeId: SwarmNodeId): Promise<void>;
  /** Send a directive to a specific node. */
  sendDirective(nodeId: SwarmNodeId, directive: SwarmDirective): Promise<SwarmDirectiveResult>;
  /** Broadcast a directive to multiple nodes. */
  broadcastDirective(
    nodeIds: SwarmNodeId[],
    directive: SwarmDirective,
  ): Promise<SwarmDirectiveResult[]>;
  /** Fetch the agent card of a remote node. */
  fetchRemoteAgentCard(endpoint: string): Promise<Record<string, unknown>>;
  /** Ping a remote node for health check. */
  ping(nodeId: SwarmNodeId): Promise<boolean>;
}
