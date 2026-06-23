/**
 * Swarm Node Registry — Node registration, discovery, heartbeat, and lifecycle.
 *
 * Uses the existing `nodes` table (migration 015) plus swarm-specific tables
 * from migration 043 for directives and resource snapshots.
 */
import { getCoreDb } from '../../../../src/db/client.ts';
import type { InValue } from 'npm:@libsql/client';
import { fetchAgentCard } from '../../../server/src/a2a/client.ts';
import type { AgentCard } from '../../../server/src/a2a/types.ts';
import type { CapabilityGroup } from '../../../../src/tools/types.ts';
import type {
  ISwarmNode,
  NodeMetrics,
  NodeStatus,
  NodeTier,
  SwarmNodeId,
  SwarmNodeRegistration,
} from '../../contracts/swarm.ts';

const HEARTBEAT_INTERVAL_MS = 30_000;
const NODE_STALE_MS = 120_000;
const METRICS_RETENTION_COUNT = 1440;

/**
 * Map the coordinator's NodeStatus to the DB's allowed values.
 * The `nodes` table CHECK constraint restricts status to:
 * ('connecting','connected','disconnected','error','deregistered').
 */
function toDbStatus(status: NodeStatus): string {
  switch (status) {
    case 'online':
    case 'draining':
    case 'degraded':
      return 'connected';
    case 'offline':
    case 'sealed':
      return 'disconnected';
    default:
      return status;
  }
}

interface NodeRow {
  id: string;
  name: string;
  endpoint: string;
  tier: NodeTier;
  status: NodeStatus;
  capabilities: string;
  version: string | null;
  group_name: string | null;
  last_heartbeat: string | null;
  last_processed_directive_id: string | null;
  registered_at: string;
  created_at: string;
  updated_at: string;
  cpu_percent: number;
  memory_used_mb: number;
  memory_total_mb: number;
  active_sessions: number;
  active_processes: number;
  labels: string;
  metrics_json: string;
  a2a_endpoint: string;
}

function rowToNode(row: NodeRow, agentCard?: AgentCard): ISwarmNode {
  let labels: Record<string, string> = {};
  let metrics: NodeMetrics = {
    cpuPercent: 0,
    memoryUsedMb: 0,
    memoryTotalMb: 0,
    diskUsedMb: 0,
    diskTotalMb: 0,
    activeSessions: 0,
    activeProcesses: 0,
    tokensUsedToday: 0,
    tokensOutToday: 0,
    costUsdToday: 0,
    uptimeSeconds: 0,
  };

  try {
    labels = JSON.parse(row.labels || '{}');
  } catch { /* ignore */ }
  try {
    const raw = JSON.parse(row.metrics_json || '{}');
    metrics = {
      cpuPercent: row.cpu_percent ?? raw.cpuPercent ?? 0,
      memoryUsedMb: row.memory_used_mb ?? raw.memoryUsedMb ?? 0,
      memoryTotalMb: row.memory_total_mb ?? raw.memoryTotalMb ?? 0,
      diskUsedMb: raw.diskUsedMb ?? 0,
      diskTotalMb: raw.diskTotalMb ?? 0,
      activeSessions: row.active_sessions ?? raw.activeSessions ?? 0,
      activeProcesses: row.active_processes ?? raw.activeProcesses ?? 0,
      tokensUsedToday: raw.tokensUsedToday ?? 0,
      tokensOutToday: raw.tokensOutToday ?? 0,
      costUsdToday: raw.costUsdToday ?? 0,
      uptimeSeconds: raw.uptimeSeconds ?? 0,
    };
  } catch { /* ignore */ }

  let capabilities: CapabilityGroup[] = [];
  try {
    capabilities = JSON.parse(row.capabilities || '[]');
  } catch { /* ignore */ }
  return {
    nodeId: row.id,
    name: row.name,
    host: new URL(row.endpoint).hostname,
    port: parseInt(new URL(row.endpoint).port || '443'),
    tier: row.tier,
    group: row.group_name ?? undefined,
    status: row.status,
    capabilities,
    a2aEndpoint: row.a2a_endpoint || `${row.endpoint}/a2a`,
    agentCard: agentCard as unknown as Record<string, unknown> | undefined,
    metrics,
    labels,
    registeredAt: row.registered_at,
    lastHeartbeatAt: row.last_heartbeat ?? row.created_at,
    lastSeenAt: row.last_heartbeat ?? row.created_at,
  };
}

async function getNodeById(nodeId: SwarmNodeId): Promise<NodeRow | null> {
  const db = await getCoreDb();
  return db.get<NodeRow>(
    `SELECT * FROM nodes WHERE id = ?`,
    [nodeId],
  ) as Promise<NodeRow | null>;
}

async function getNodeByEndpoint(endpoint: string): Promise<NodeRow | null> {
  const db = await getCoreDb();
  return db.get<NodeRow>(
    `SELECT * FROM nodes WHERE endpoint = ?`,
    [endpoint],
  ) as Promise<NodeRow | null>;
}

export async function registerNode(reg: SwarmNodeRegistration): Promise<SwarmNodeId> {
  const db = await getCoreDb();
  const nodeId = reg.nodeId ?? `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  const endpoint = `http${reg.host === 'localhost' ? '' : 's'}://${reg.host}:${String(reg.port)}`;
  const a2aEndpoint = reg.a2aEndpoint ?? `${endpoint}/a2a`;

  const existing = await getNodeByEndpoint(endpoint);
  if (existing) {
    await db.run(
      `UPDATE nodes
       SET name = ?, tier = ?, capabilities = ?, group_name = ?, labels = ?,
           a2a_endpoint = ?, status = 'connected', last_heartbeat = ?, updated_at = ?
       WHERE id = ?`,
      [
        reg.name,
        reg.tier ?? 'unprivileged',
        JSON.stringify(reg.capabilities ?? []),
        reg.group ?? null,
        JSON.stringify(reg.labels ?? {}),
        a2aEndpoint,
        now,
        now,
        existing.id,
      ] as InValue[],
    );
    return existing.id;
  }

  await db.run(
    `INSERT INTO nodes (id, name, endpoint, tier, status, capabilities, group_name, labels, a2a_endpoint, last_heartbeat, registered_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'connected', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      nodeId,
      reg.name,
      endpoint,
      reg.tier ?? 'unprivileged',
      JSON.stringify(reg.capabilities ?? []),
      reg.group ?? null,
      JSON.stringify(reg.labels ?? {}),
      a2aEndpoint,
      now,
      now,
      now,
      now,
    ] as InValue[],
  );

  return nodeId;
}

export async function heartbeat(
  nodeId: SwarmNodeId,
  metrics: NodeMetrics,
): Promise<void> {
  const db = await getCoreDb();
  const now = new Date().toISOString();

  await db.run(
    `UPDATE nodes
     SET status = 'connected',
         last_heartbeat = ?,
         cpu_percent = ?,
         memory_used_mb = ?,
         memory_total_mb = ?,
         active_sessions = ?,
         active_processes = ?,
         metrics_json = ?,
         updated_at = ?
     WHERE id = ?`,
    [
      now,
      metrics.cpuPercent,
      metrics.memoryUsedMb,
      metrics.memoryTotalMb,
      metrics.activeSessions,
      metrics.activeProcesses,
      JSON.stringify(metrics),
      now,
      nodeId,
    ] as InValue[],
  );

  await db.run(
    `INSERT INTO swarm_resource_snapshots
     (node_id, cpu_percent, memory_used_mb, memory_total_mb, disk_used_mb, disk_total_mb,
      active_sessions, active_processes, uptime_seconds, tokens_in, tokens_out, cost_usd,
      tool_calls, cpu_ms, snapshot_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      nodeId,
      metrics.cpuPercent,
      metrics.memoryUsedMb,
      metrics.memoryTotalMb,
      metrics.diskUsedMb,
      metrics.diskTotalMb,
      metrics.activeSessions,
      metrics.activeProcesses,
      metrics.uptimeSeconds,
       metrics.tokensUsedToday,
       metrics.tokensOutToday,
       metrics.costUsdToday,
      0,
      0,
      now,
      now,
    ] as InValue[],
  );

  await pruneSnapshots(nodeId);
}

async function pruneSnapshots(nodeId: SwarmNodeId): Promise<void> {
  const db = await getCoreDb();
  await db.run(
    `DELETE FROM swarm_resource_snapshots
     WHERE id NOT IN (
       SELECT id FROM swarm_resource_snapshots
       WHERE node_id = ?
       ORDER BY snapshot_at DESC
       LIMIT ?
     ) AND node_id = ?`,
    [nodeId, METRICS_RETENTION_COUNT, nodeId],
  );
}

export async function updateNodeStatus(
  nodeId: SwarmNodeId,
  status: NodeStatus,
): Promise<void> {
  const db = await getCoreDb();
  await db.run(
    `UPDATE nodes SET status = ?, updated_at = ? WHERE id = ?`,
    [toDbStatus(status), new Date().toISOString(), nodeId],
  );
}

export async function listNodes(status?: NodeStatus): Promise<ISwarmNode[]> {
  const db = await getCoreDb();
  let rows: NodeRow[];
  if (status) {
    rows = await db.all<NodeRow>(
      `SELECT * FROM nodes WHERE status = ? ORDER BY name`,
      [status],
    );
  } else {
    rows = await db.all<NodeRow>(
      `SELECT * FROM nodes ORDER BY status, name`,
    );
  }
  return rows.map((r) => rowToNode(r));
}

export async function getNode(nodeId: SwarmNodeId): Promise<ISwarmNode | null> {
  const row = await getNodeById(nodeId);
  if (!row) return null;

  let agentCard: AgentCard | undefined;
  try {
    if (row.a2a_endpoint) {
      const baseUrl = row.a2a_endpoint.replace(/\/a2a$/, '');
      agentCard = await fetchAgentCard(baseUrl);
    }
  } catch { /* agent card fetch is best-effort */ }

  return rowToNode(row, agentCard);
}

/**
 * Discover and register peer nodes.
 *
 * Without arguments: queries the existing nodes table for connected nodes
 * and tries to refresh their agent cards. Also checks config for seed nodes.
 *
 * With knownEndpoints: fetches agent cards from the given endpoints and
 * registers them as new nodes.
 */
export async function discoverPeers(
  knownEndpoints?: string[],
): Promise<ISwarmNode[]> {
  const nodes: ISwarmNode[] = [];

  // Phase 1: Discover from explicit endpoints
  if (knownEndpoints && knownEndpoints.length > 0) {
    for (const endpoint of knownEndpoints) {
      try {
        const card = await fetchAgentCard(endpoint);
        const reg: SwarmNodeRegistration = {
          name: card.name,
          host: new URL(card.url).hostname,
          port: parseInt(new URL(card.url).port || (card.url.startsWith('https') ? '443' : '80')),
          a2aEndpoint: card.interfaces.find((i) => i.protocol === 'json-rpc')?.url ?? `${card.url}/a2a`,
          capabilities: card.skills.map((s) => s.id as CapabilityGroup),
        };
        const nodeId = await registerNode(reg);
        const node = await getNode(nodeId);
        if (node) nodes.push(node);
      } catch {
        // Peer unreachable — skip
      }
    }
  }

  // Phase 2: Discover from config seed nodes
  try {
    const { loadConfig } = await import('../../../../src/config/config.ts');
    const config = await loadConfig();
    const seeds = (config as unknown as { swarm?: { seedNodes?: string[] } }).swarm?.seedNodes;
    if (seeds && seeds.length > 0) {
      for (const seed of seeds) {
        // Skip if already discovered from knownEndpoints
        if (nodes.some((n) => n.a2aEndpoint === seed || n.a2aEndpoint === `${seed}/a2a`)) continue;
        try {
          const card = await fetchAgentCard(seed);
          const reg: SwarmNodeRegistration = {
            name: card.name,
            host: new URL(card.url).hostname,
            port: parseInt(new URL(card.url).port || ((card.url.startsWith('https') ? '443' : '80'))),
            a2aEndpoint: card.interfaces.find((i) => i.protocol === 'json-rpc')?.url ?? `${card.url}/a2a`,
            capabilities: card.skills.map((s) => s.id as CapabilityGroup),
          };
          const nodeId = await registerNode(reg);
          const node = await getNode(nodeId);
          if (node) nodes.push(node);
        } catch { /* seed unreachable */ }
      }
    }
  } catch { /* config unavailable */ }

  // Phase 3: Discover from existing DB nodes (refresh their agent cards)
  if (nodes.length === 0) {
    const dbNodes = await listNodes('connected');
    for (const n of dbNodes) {
      try {
        const row = await getNodeById(n.nodeId);
        if (row?.a2a_endpoint) {
          const baseUrl = row.a2a_endpoint.replace(/\/a2a$/, '');
          const card = await fetchAgentCard(baseUrl);
          const node = rowToNode(row, card);
          nodes.push(node);
        }
      } catch { /* node unreachable, skip */ }
    }
  }

  return nodes;
}

export async function markNodesOffline(staleMs = NODE_STALE_MS): Promise<number> {
  const db = await getCoreDb();
  const cutoff = new Date(Date.now() - staleMs).toISOString();

  const stale = await db.all<{ id: string }>(
    `SELECT id FROM nodes
     WHERE status = 'connected' AND (last_heartbeat IS NULL OR last_heartbeat < ?)`,
    [cutoff],
  );

  if (stale.length === 0) return 0;

  await db.run(
    `UPDATE nodes SET status = 'disconnected', updated_at = ?
     WHERE id IN (${stale.map(() => '?').join(',')})`,
    [new Date().toISOString(), ...stale.map((r) => r.id)],
  );

  return stale.length;
}

export async function removeNode(nodeId: SwarmNodeId): Promise<void> {
  const db = await getCoreDb();
  await db.run(`DELETE FROM swarm_resource_snapshots WHERE node_id = ?`, [nodeId]);
  await db.run(`DELETE FROM swarm_directives WHERE source_node_id = ? OR target_node_id = ?`, [nodeId, nodeId]);
  await db.run(`DELETE FROM nodes WHERE id = ?`, [nodeId]);
}

export { HEARTBEAT_INTERVAL_MS, NODE_STALE_MS };
