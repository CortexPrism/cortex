import { getMemoryDb } from '../db/client.ts';
import type { InValue } from 'npm:@libsql/client';

function graphId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export type RelationType =
  | 'uses'
  | 'replaces'
  | 'extends'
  | 'is_part_of'
  | 'is_instance_of'
  | 'related_to'
  | 'contradicts'
  | 'supports'
  | 'causes'
  | 'requires'
  | 'configures';

export interface GraphEntity {
  id: string;
  name: string;
  type: string;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface GraphRelation {
  id: string;
  source_id: string;
  target_id: string;
  relation: RelationType;
  strength: number;
  metadata: string | null;
  created_at: string;
}

export interface GraphHit {
  entity: GraphEntity;
  relation: RelationType;
  direction: 'outbound' | 'inbound';
  strength: number;
  peer: GraphEntity;
}

export async function upsertEntity(opts: {
  name: string;
  type: string;
  description?: string;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const db = await getMemoryDb();

  const existing = await db.get<{ id: string }>(
    `SELECT id FROM graph_entities WHERE name = ? AND type = ? LIMIT 1`,
    [opts.name, opts.type],
  );
  if (existing) return existing.id;

  const id = graphId('ent');
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO graph_entities (id, name, type, description, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      opts.name,
      opts.type,
      opts.description ?? null,
      JSON.stringify(opts.metadata ?? {}),
      now,
      now,
    ] as InValue[],
  );

  return id;
}

export async function addRelation(opts: {
  sourceName: string;
  sourceType: string;
  targetName: string;
  targetType: string;
  relation: RelationType;
  strength?: number;
  context?: string;
}): Promise<string> {
  const [sourceId, targetId] = await Promise.all([
    upsertEntity({ name: opts.sourceName, type: opts.sourceType }),
    upsertEntity({ name: opts.targetName, type: opts.targetType }),
  ]);

  const db = await getMemoryDb();

  const existing = await db.get<{ id: string }>(
    `SELECT id FROM graph_relations WHERE source_id = ? AND target_id = ? AND relation = ? LIMIT 1`,
    [sourceId, targetId, opts.relation],
  );

  if (existing) {
    await db.run(
      `UPDATE graph_relations
       SET strength = MIN(1.0, strength + 0.1),
           access_count = access_count + 1,
           updated_at = datetime('now')
       WHERE id = ?`,
      [existing.id],
    );
    return existing.id;
  }

  const id = graphId('rel');
  const now = new Date().toISOString();
  const metadata = opts.context ? JSON.stringify({ context: opts.context }) : '{}';
  await db.run(
    `INSERT INTO graph_relations (id, source_id, target_id, relation, strength, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      sourceId,
      targetId,
      opts.relation,
      opts.strength ?? 1.0,
      metadata,
      now,
      now,
    ] as InValue[],
  );

  return id;
}

export async function traverseGraph(
  entityName: string,
  opts: { depth?: number; relationTypes?: RelationType[]; limit?: number } = {},
): Promise<GraphHit[]> {
  const db = await getMemoryDb();
  const depth = opts.depth ?? 2;
  const limit = opts.limit ?? 20;

  const root = await db.get<GraphEntity>(
    `SELECT * FROM graph_entities WHERE name = ? LIMIT 1`,
    [entityName],
  );
  if (!root) return [];

  const visited = new Set<string>([root.id]);
  const results: GraphHit[] = [];
  const queue: Array<{ id: string; currentDepth: number }> = [{ id: root.id, currentDepth: 0 }];

  while (queue.length > 0 && results.length < limit) {
    const { id, currentDepth } = queue.shift()!;
    if (currentDepth >= depth) continue;

    const typeFilter = opts.relationTypes?.length
      ? `AND relation IN (${opts.relationTypes.map(() => '?').join(',')})`
      : '';
    const typeArgs = opts.relationTypes ?? [];

    const outbound = await db.all<{
      id: string;
      target_id: string;
      relation: string;
      strength: number;
      metadata: string | null;
      created_at: string;
    }>(
      `SELECT id, target_id, relation, strength, metadata, created_at
       FROM graph_relations WHERE source_id = ? ${typeFilter} ORDER BY strength DESC LIMIT 10`,
      [id, ...typeArgs] as InValue[],
    );

    const inbound = await db.all<{
      id: string;
      source_id: string;
      relation: string;
      strength: number;
      metadata: string | null;
      created_at: string;
    }>(
      `SELECT id, source_id, relation, strength, metadata, created_at
       FROM graph_relations WHERE target_id = ? ${typeFilter} ORDER BY strength DESC LIMIT 10`,
      [id, ...typeArgs] as InValue[],
    );

    for (const edge of outbound) {
      if (visited.has(edge.target_id)) continue;
      visited.add(edge.target_id);
      const peer = await db.get<GraphEntity>(
        `SELECT * FROM graph_entities WHERE id = ?`,
        [edge.target_id],
      );
      if (!peer) continue;
      results.push({
        entity: root,
        relation: edge.relation as RelationType,
        direction: 'outbound',
        strength: edge.strength,
        peer,
      });
      queue.push({ id: edge.target_id, currentDepth: currentDepth + 1 });
    }

    for (const edge of inbound) {
      if (visited.has(edge.source_id)) continue;
      visited.add(edge.source_id);
      const peer = await db.get<GraphEntity>(
        `SELECT * FROM graph_entities WHERE id = ?`,
        [edge.source_id],
      );
      if (!peer) continue;
      results.push({
        entity: root,
        relation: edge.relation as RelationType,
        direction: 'inbound',
        strength: edge.strength,
        peer,
      });
      queue.push({ id: edge.source_id, currentDepth: currentDepth + 1 });
    }
  }

  return results.sort((a, b) => b.strength - a.strength).slice(0, limit);
}

export async function searchEntities(query: string, limit = 10): Promise<GraphEntity[]> {
  const db = await getMemoryDb();
  return await db.all<GraphEntity>(
    `SELECT * FROM graph_entities
     WHERE name LIKE ? OR description LIKE ?
     ORDER BY updated_at DESC
     LIMIT ?`,
    [`%${query}%`, `%${query}%`, limit] as InValue[],
  );
}

const ENTITY_STOP_WORDS = new Set([
  'The',
  'This',
  'That',
  'These',
  'Those',
  'There',
  'Their',
  'They',
  'Them',
  'With',
  'From',
  'Into',
  'Upon',
  'Also',
  'Some',
  'Such',
  'Each',
  'Both',
  'More',
  'Most',
  'When',
  'Then',
  'Than',
  'Have',
  'Does',
  'Will',
  'Would',
  'Could',
  'Should',
  'Here',
  'Just',
  'What',
  'Which',
  'While',
  'Where',
  'User',
  'Assistant',
  'Agent',
  'Based',
  'Note',
  'Please',
  'Return',
  'True',
  'False',
  'None',
  'Null',
  'Error',
  'Type',
  'Value',
  'Name',
  'String',
  'Number',
  'Object',
  'Array',
  'Function',
  'Class',
  'Interface',
]);

export async function extractAndStoreEntities(text: string, sessionId?: string): Promise<void> {
  const patterns: Array<{ regex: RegExp; type: string }> = [
    { regex: /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\b/g, type: 'concept' },
    { regex: /`([a-zA-Z_][a-zA-Z0-9_.]+)`/g, type: 'code' },
    { regex: /https?:\/\/([a-zA-Z0-9.-]+)/g, type: 'domain' },
  ];

  const found: Array<{ name: string; type: string }> = [];

  for (const { regex, type } of patterns) {
    const matches = text.matchAll(regex);
    for (const match of matches) {
      const name = (match[1] ?? match[0]).trim();
      if (name.length >= 3 && name.length <= 80) {
        if (type === 'concept' && ENTITY_STOP_WORDS.has(name.split(' ')[0])) continue;
        found.push({ name, type });
      }
    }
  }

  if (found.length === 0) return;

  const deduped = [...new Map(found.map((f) => [`${f.type}:${f.name}`, f])).values()].slice(0, 20);

  const context = sessionId ? `Mentioned in session ${sessionId}` : undefined;

  for (let i = 0; i < deduped.length - 1; i++) {
    const a = deduped[i];
    const b = deduped[i + 1];
    await addRelation({
      sourceName: a.name,
      sourceType: a.type,
      targetName: b.name,
      targetType: b.type,
      relation: 'related_to',
      strength: 0.5,
      context,
    }).catch(() => {});
  }
}

export interface DuplicateGroup {
  name: string;
  entities: Array<{ id: string; type: string; description: string | null }>;
  similarity: number;
}

export async function findDuplicateEntities(): Promise<DuplicateGroup[]> {
  const db = await getMemoryDb();
  const entities = await db.all<
    { id: string; name: string; type: string; description: string | null }
  >(
    `SELECT id, name, type, description FROM graph_entities ORDER BY name ASC`,
  );

  const groups: DuplicateGroup[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < entities.length; i++) {
    if (seen.has(entities[i].id)) continue;
    const group: DuplicateGroup = {
      name: entities[i].name,
      entities: [{
        id: entities[i].id,
        type: entities[i].type,
        description: entities[i].description,
      }],
      similarity: 0,
    };

    for (let j = i + 1; j < entities.length; j++) {
      const a = entities[i].name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const b = entities[j].name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (a === b || (a.length > 3 && b.length > 3 && (a.includes(b) || b.includes(a)))) {
        group.entities.push({
          id: entities[j].id,
          type: entities[j].type,
          description: entities[j].description,
        });
        seen.add(entities[j].id);
      }
    }

    if (group.entities.length > 1) {
      group.similarity = 0.8;
      groups.push(group);
      seen.add(entities[i].id);
    }
  }

  return groups;
}

export async function mergeEntities(sourceId: string, targetId: string): Promise<number> {
  const db = await getMemoryDb();

  await db.run(
    `UPDATE graph_relations SET source_id = ? WHERE source_id = ?`,
    [targetId, sourceId],
  );
  await db.run(
    `UPDATE graph_relations SET target_id = ? WHERE target_id = ?`,
    [targetId, sourceId],
  );
  await db.run(`DELETE FROM graph_relations WHERE source_id = ? OR target_id = ?`, [
    sourceId,
    sourceId,
  ]);
  await db.run(`DELETE FROM graph_entities WHERE id = ?`, [sourceId]);

  return 1;
}

export interface GraphNode {
  id: string;
  name: string;
  type: string;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  connections: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
  strength: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  focused?: string;
}

export async function getGraphData(
  entityName?: string,
  opts: { depth?: number; limit?: number } = {},
): Promise<GraphData> {
  const db = await getMemoryDb();

  if (entityName) {
    const root = await db.get<GraphEntity>(
      `SELECT * FROM graph_entities WHERE name = ? LIMIT 1`,
      [entityName],
    );
    if (!root) return { nodes: [], edges: [] };

    const depth = opts.depth ?? 2;
    const limit = opts.limit ?? 50;
    const nodeMap = new Map<string, GraphNode>();
    const edgeMap = new Map<string, GraphEdge>();
    const visited = new Set<string>([root.id]);

    nodeMap.set(root.id, {
      id: root.id,
      name: root.name,
      type: root.type,
      description: root.description,
      metadata: root.metadata ?? {},
      created_at: root.created_at,
      connections: 0,
    });

    const queue: Array<{ id: string; currentDepth: number }> = [{ id: root.id, currentDepth: 0 }];

    while (queue.length > 0 && nodeMap.size < limit) {
      const { id, currentDepth } = queue.shift()!;
      if (currentDepth >= depth) continue;

      const edges = await db.all<{
        id: string;
        source_id: string;
        target_id: string;
        relation: string;
        strength: number;
      }>(
        `SELECT id, source_id, target_id, relation, strength
         FROM graph_relations WHERE source_id = ? OR target_id = ?
         ORDER BY strength DESC LIMIT 20`,
        [id, id],
      );

      for (const edge of edges) {
        const peerId = edge.source_id === id ? edge.target_id : edge.source_id;
        const edgeKey = edge.id;

        if (!edgeMap.has(edgeKey)) {
          edgeMap.set(edgeKey, {
            id: edge.id,
            source: edge.source_id,
            target: edge.target_id,
            relation: edge.relation,
            strength: edge.strength,
          });
        }

        const currentNode = nodeMap.get(id)!;
        currentNode.connections++;

        if (!visited.has(peerId)) {
          visited.add(peerId);
          const peer = await db.get<GraphEntity>(
            `SELECT * FROM graph_entities WHERE id = ?`,
            [peerId],
          );
          if (peer) {
            nodeMap.set(peer.id, {
              id: peer.id,
              name: peer.name,
              type: peer.type,
              description: peer.description,
              metadata: peer.metadata ?? {},
              created_at: peer.created_at,
              connections: 1,
            });
            queue.push({ id: peer.id, currentDepth: currentDepth + 1 });
          }
        }
      }
    }

    return { nodes: [...nodeMap.values()], edges: [...edgeMap.values()], focused: root.id };
  }

  const count = await db.get<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM graph_relations`,
  );
  const edgeLimit = opts.limit ?? 200;

  if (!count || count.cnt === 0) return { nodes: [], edges: [] };

  const topEdges = await db.all<{
    id: string;
    source_id: string;
    target_id: string;
    relation: string;
    strength: number;
  }>(
    `SELECT id, source_id, target_id, relation, strength
     FROM graph_relations ORDER BY strength DESC LIMIT ?`,
    [edgeLimit],
  );

  const nodeIds = new Set<string>();
  for (const e of topEdges) {
    nodeIds.add(e.source_id);
    nodeIds.add(e.target_id);
  }

  const entityRows = await db.all<GraphEntity>(
    `SELECT * FROM graph_entities WHERE id IN (${[...nodeIds].map(() => '?').join(',')})`,
    [...nodeIds],
  );

  const connectionCounts = new Map<string, number>();
  for (const e of topEdges) {
    connectionCounts.set(e.source_id, (connectionCounts.get(e.source_id) ?? 0) + 1);
    connectionCounts.set(e.target_id, (connectionCounts.get(e.target_id) ?? 0) + 1);
  }

  const nodes: GraphNode[] = entityRows.map((e) => ({
    id: e.id,
    name: e.name,
    type: e.type,
    description: e.description,
    metadata: e.metadata ?? {},
    created_at: e.created_at,
    connections: connectionCounts.get(e.id) ?? 0,
  }));

  const edges: GraphEdge[] = topEdges.map((e) => ({
    id: e.id,
    source: e.source_id,
    target: e.target_id,
    relation: e.relation,
    strength: e.strength,
  }));

  return { nodes, edges };
}
