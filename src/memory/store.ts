import { getMemoryDb } from '../db/client.ts';
import type { EmbeddingProvider, EmbeddingVector } from './embeddings.ts';
import { blobToVector, vectorToBlob } from './embeddings.ts';
import type { InValue } from 'npm:@libsql/client';
import { searchEntities, traverseGraph } from './graph.ts';
import { recordBatchAccess } from './heuristics.ts';

function memId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function safeJsonParse(raw: string | null): string[] | undefined {
  if (!raw || raw === '[]') return undefined;
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return undefined;
  }
}

export interface EpisodicEntry {
  id: string;
  session_id: string | null;
  summary: string;
  topics: string[];
  entities: string[];
  start_time: string;
  importance: number;
  decay_score: number;
  created_at: string;
}

export interface SemanticEntry {
  id: string;
  content: string;
  summary: string | null;
  category: string;
  tags: string[];
  importance: number;
  decay_score: number;
  created_at: string;
}

export async function writeEpisodic(opts: {
  sessionId: string;
  summary: string;
  topics?: string[];
  entities?: string[];
  importance?: number;
  embedder?: EmbeddingProvider;
}): Promise<string> {
  const db = await getMemoryDb();
  const id = memId('ep');
  const now = new Date().toISOString();
  const topics = JSON.stringify(opts.topics ?? []);
  const entities = JSON.stringify(opts.entities ?? []);
  const importance = opts.importance ?? 0.5;

  let embedding: Uint8Array | null = null;
  let embModel: string | null = null;

  if (opts.embedder) {
    try {
      const vec = await opts.embedder.embed(opts.summary);
      embedding = vectorToBlob(vec);
      embModel = opts.embedder.name;
    } catch {
      // non-fatal
    }
  }

  await db.run(
    `INSERT INTO episodic_memory
       (id, session_id, summary, topics, entities, start_time, importance, embedding, embedding_model, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      opts.sessionId,
      opts.summary,
      topics,
      entities,
      now,
      importance,
      embedding,
      embModel,
      now,
    ] as InValue[],
  );

  await db.run(
    `INSERT INTO episodic_fts(rowid, summary, topics)
     SELECT rowid, summary, topics FROM episodic_memory WHERE id = ?`,
    [id],
  );

  return id;
}

export async function writeSemantic(opts: {
  content: string;
  summary?: string;
  category?: string;
  tags?: string[];
  importance?: number;
  embedder?: EmbeddingProvider;
}): Promise<string> {
  const db = await getMemoryDb();
  const id = memId('sem');
  const now = new Date().toISOString();
  const tags = JSON.stringify(opts.tags ?? []);
  const category = opts.category ?? 'general';
  const importance = opts.importance ?? 0.5;

  let embedding: Uint8Array | null = null;
  let embModel: string | null = null;

  if (opts.embedder) {
    try {
      const vec = await opts.embedder.embed(opts.content);
      embedding = vectorToBlob(vec);
      embModel = opts.embedder.name;
    } catch {
      // non-fatal
    }
  }

  await db.run(
    `INSERT INTO semantic_memory
       (id, content, summary, category, tags, importance, embedding, embedding_model, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      opts.content,
      opts.summary ?? null,
      category,
      tags,
      importance,
      embedding,
      embModel,
      now,
      now,
    ] as InValue[],
  );

  await db.run(
    `INSERT INTO semantic_fts(rowid, content, summary)
     SELECT rowid, content, COALESCE(summary, '') FROM semantic_memory WHERE id = ?`,
    [id],
  );

  return id;
}

export interface MemoryHit {
  id: string;
  type: 'episodic' | 'semantic';
  text: string;
  score: number;
  created_at: string;
  entities?: string[];
  topics?: string[];
  tags?: string[];
  category?: string;
  decayScore?: number;
  accessCount?: number;
}

export async function searchEpisodic(
  query: string,
  limit = 5,
): Promise<MemoryHit[]> {
  const db = await getMemoryDb();
  const rows = await db.all<{
    id: string;
    summary: string;
    created_at: string;
    rank: number;
    entities: string | null;
    topics: string | null;
    decay_score: number | null;
    access_count: number | null;
  }>(
    `SELECT em.id, em.summary, em.created_at, em.entities, em.topics,
            fts.rank, em.decay_score, em.access_count
     FROM episodic_fts fts
     JOIN episodic_memory em ON fts.rowid = em.rowid
     WHERE episodic_fts MATCH ?
     ORDER BY fts.rank
     LIMIT ?`,
    [query, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    type: 'episodic' as const,
    text: r.summary,
    score: Math.max(0, 1 + (r.rank ?? -1)),
    created_at: r.created_at,
    entities: safeJsonParse(r.entities),
    topics: safeJsonParse(r.topics),
    decayScore: r.decay_score ?? undefined,
    accessCount: r.access_count ?? undefined,
  }));
}

export async function searchSemantic(
  query: string,
  limit = 5,
): Promise<MemoryHit[]> {
  const db = await getMemoryDb();
  const rows = await db.all<{
    id: string;
    content: string;
    created_at: string;
    rank: number;
    tags: string | null;
    category: string | null;
    decay_score: number | null;
    access_count: number | null;
  }>(
    `SELECT sm.id, sm.content, sm.created_at, sm.tags, sm.category,
            fts.rank, sm.decay_score, sm.access_count
     FROM semantic_fts fts
     JOIN semantic_memory sm ON fts.rowid = sm.rowid
     WHERE semantic_fts MATCH ?
     ORDER BY fts.rank
     LIMIT ?`,
    [query, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    type: 'semantic' as const,
    text: r.content,
    score: Math.max(0, 1 + (r.rank ?? -1)),
    created_at: r.created_at,
    tags: safeJsonParse(r.tags),
    category: r.category ?? undefined,
    decayScore: r.decay_score ?? undefined,
    accessCount: r.access_count ?? undefined,
  }));
}

export async function searchByVector(
  queryVec: EmbeddingVector,
  type: 'episodic' | 'semantic',
  limit = 5,
): Promise<MemoryHit[]> {
  const db = await getMemoryDb();
  const table = type === 'episodic' ? 'episodic_memory' : 'semantic_memory';
  const textCol = type === 'episodic' ? 'summary' : 'content';

  const rows = await db.all<{
    id: string;
    text: string;
    embedding: Uint8Array | null;
    created_at: string;
    decay_score: number;
    entities?: string | null;
    topics?: string | null;
    tags?: string | null;
    category?: string | null;
    access_count?: number | null;
  }>(
    `SELECT id, ${textCol} as text, embedding, created_at, COALESCE(decay_score, 1.0) as decay_score,
            ${
      type === 'episodic'
        ? 'entities, topics, NULL as tags, NULL as category'
        : 'NULL as entities, NULL as topics, tags, category'
    },
            access_count
     FROM ${table}
     WHERE embedding IS NOT NULL
       AND COALESCE(decay_score, 1.0) > 0.01
     ORDER BY COALESCE(decay_score, 1.0) * (1.0 / (1.0 + (julianday('now') - julianday(created_at)) / 30.0)) DESC
     LIMIT 500`,
  );

  const scored = rows
    .map((r) => {
      const vec = blobToVector(r.embedding);
      if (!vec) return null;
      const sim = cosineSim(queryVec, vec);
      return { ...r, score: sim };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map((r) => ({
    id: r.id,
    type,
    text: r.text,
    score: r.score,
    created_at: r.created_at,
    entities: type === 'episodic' ? safeJsonParse(r.entities as string | null) : undefined,
    topics: type === 'episodic' ? safeJsonParse(r.topics as string | null) : undefined,
    tags: type === 'semantic' ? safeJsonParse(r.tags as string | null) : undefined,
    category: type === 'semantic' ? (r.category ?? undefined) : undefined,
    decayScore: r.decay_score,
    accessCount: r.access_count ?? undefined,
  }));
}

function cosineSim(a: EmbeddingVector, b: EmbeddingVector): number {
  const len = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}

export function decayScore(createdAt: string, halfLifeDays: number): number {
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / 86_400_000;
  return Math.pow(2, -ageDays / halfLifeDays);
}

export async function retrieve(
  query: string,
  embedder: EmbeddingProvider | null,
  opts: { limit?: number; episodicHalfLife?: number; semanticHalfLife?: number } = {},
): Promise<MemoryHit[]> {
  const limit = opts.limit ?? 6;
  const episodicHL = opts.episodicHalfLife ?? 14;
  const semanticHL = opts.semanticHalfLife ?? 30;

  const [kwEp, kwSem] = await Promise.all([
    searchEpisodic(query, limit * 2).catch(() => [] as MemoryHit[]),
    searchSemantic(query, limit * 2).catch(() => [] as MemoryHit[]),
  ]);

  let vecEp: MemoryHit[] = [];
  let vecSem: MemoryHit[] = [];

  if (embedder) {
    try {
      const qVec = await embedder.embed(query);
      [vecEp, vecSem] = await Promise.all([
        searchByVector(qVec, 'episodic', limit).catch(() => []),
        searchByVector(qVec, 'semantic', limit).catch(() => []),
      ]);
    } catch {
      // non-fatal — fall back to keyword only
    }
  }

  const graphHits: MemoryHit[] = await (async () => {
    const queryWords = query.split(/\s+/).filter((w) => w.length >= 4);
    const hits: MemoryHit[] = [];
    for (const word of queryWords.slice(0, 3)) {
      const entities = await searchEntities(word, 3).catch(() => []);
      for (const entity of entities) {
        const traversal = await traverseGraph(entity.name, { depth: 1, limit: 4 }).catch(() => []);
        for (const hit of traversal) {
          const text = `${entity.name} ${hit.relation} ${hit.peer.name}${
            hit.peer.description ? `: ${hit.peer.description}` : ''
          }`;
          hits.push({
            id: `graph_${entity.id}_${hit.peer.id}`,
            type: 'semantic',
            text,
            score: hit.strength * 0.7,
            created_at: entity.created_at,
          });
        }
      }
    }
    return hits;
  })().catch(() => []);

  const seen = new Set<string>();
  const merged: MemoryHit[] = [];

  for (const hit of [...kwEp, ...kwSem, ...vecEp, ...vecSem, ...graphHits]) {
    if (seen.has(hit.id)) continue;
    seen.add(hit.id);
    const hl = hit.type === 'episodic' ? episodicHL : semanticHL;
    const decay = decayScore(hit.created_at, hl);
    merged.push({ ...hit, score: hit.score * decay, decayScore: decay });
  }

  const ranked = merged.sort((a, b) => b.score - a.score).slice(0, limit);

  recordBatchAccess(ranked.map((h) => ({ id: h.id, type: h.type }))).catch(() => {});

  return ranked;
}
