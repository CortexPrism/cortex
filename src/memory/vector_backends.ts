import { type CortexConfig, loadConfig } from '../config/config.ts';
import type { EmbeddingVector } from './embeddings.ts';

export interface VectorMemoryRecord {
  id: string;
  type: 'episodic' | 'semantic';
  text: string;
  embedding: EmbeddingVector;
  sessionId?: string | null;
  topics?: string[];
  entities?: string[];
  tags?: string[];
  category?: string;
  importance: number;
  createdAt: string;
  updatedAt: string;
  decayScore?: number;
}

export interface VectorMemoryHit {
  id: string;
  type: 'episodic' | 'semantic';
  text: string;
  score: number;
  created_at: string;
  sessionId?: string | null;
  topics?: string[];
  entities?: string[];
  tags?: string[];
  category?: string;
  decayScore?: number;
  accessCount?: number;
}

interface VectorStoreOptions {
  type: 'episodic' | 'semantic';
  vector: EmbeddingVector;
  limit: number;
  sessionId?: string;
}

export interface MemoryVectorStore {
  readonly name: string;
  ensureReady(dims: number): Promise<void>;
  upsert(record: VectorMemoryRecord): Promise<void>;
  delete(ids: string[]): Promise<void>;
  search(opts: VectorStoreOptions): Promise<VectorMemoryHit[]>;
  health(): Promise<{ ok: boolean; detail?: string }>;
}

type StoreConfig = NonNullable<CortexConfig['memory']>['vectorStore'];

function payloadFromRecord(record: VectorMemoryRecord): Record<string, unknown> {
  return {
    record_type: record.type,
    text: record.text,
    session_id: record.sessionId ?? null,
    topics: record.topics ?? [],
    entities: record.entities ?? [],
    tags: record.tags ?? [],
    category: record.category ?? null,
    importance: record.importance,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    decay_score: record.decayScore ?? null,
  };
}

function payloadToHit(
  payload: Record<string, unknown> | null | undefined,
  id: string,
  type: 'episodic' | 'semantic',
  score: number,
): VectorMemoryHit {
  const asStringArray = (value: unknown): string[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    return value.filter((item): item is string => typeof item === 'string');
  };

  const createdAt = typeof payload?.created_at === 'string'
    ? payload.created_at
    : new Date().toISOString();
  const text = typeof payload?.text === 'string' ? payload.text : '';
  return {
    id,
    type,
    text,
    score,
    created_at: createdAt,
    sessionId: typeof payload?.session_id === 'string' ? payload.session_id : null,
    topics: asStringArray(payload?.topics),
    entities: asStringArray(payload?.entities),
    tags: asStringArray(payload?.tags),
    category: typeof payload?.category === 'string' ? payload.category : undefined,
    decayScore: typeof payload?.decay_score === 'number' ? payload.decay_score : undefined,
  };
}

async function requestJson(
  url: string,
  init: RequestInit & { headers?: HeadersInit } = {},
): Promise<unknown> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(url, {
    ...init,
    headers,
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`);
  }

  return await res.json().catch(() => ({}));
}

function normaliseBaseUrl(url: string | undefined, fallback: string): string {
  return (url ?? fallback).replace(/\/$/, '');
}

class QdrantVectorStore implements MemoryVectorStore {
  readonly name = 'qdrant';
  private collection: string;
  private url: string;
  private apiKey?: string;
  private ensuredDims: number | null = null;

  constructor(cfg: NonNullable<StoreConfig> & { kind: 'qdrant' }) {
    this.collection = cfg.collection ?? 'cortex_memory';
    this.url = normaliseBaseUrl(cfg.url, 'http://localhost:6333');
    this.apiKey = cfg.apiKey;
  }

  private headers(): HeadersInit {
    return this.apiKey ? { 'api-key': this.apiKey } : {};
  }

  async ensureReady(dims: number): Promise<void> {
    if (this.ensuredDims === dims) return;
    await requestJson(
      `${this.url}/collections/${encodeURIComponent(this.collection)}`,
      {
        method: 'PUT',
        headers: this.headers(),
        body: JSON.stringify({
          vectors: {
            size: dims,
            distance: 'Cosine',
          },
        }),
      },
    ).catch(() => {});
    this.ensuredDims = dims;
  }

  async upsert(record: VectorMemoryRecord): Promise<void> {
    await this.ensureReady(record.embedding.length);
    await requestJson(
      `${this.url}/collections/${encodeURIComponent(this.collection)}/points/upsert?wait=true`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          points: [{
            id: record.id,
            vector: Array.from(record.embedding),
            payload: payloadFromRecord(record),
          }],
        }),
      },
    );
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await requestJson(
      `${this.url}/collections/${encodeURIComponent(this.collection)}/points/delete?wait=true`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ points: ids }),
      },
    );
  }

  async search(opts: VectorStoreOptions): Promise<VectorMemoryHit[]> {
    await this.ensureReady(opts.vector.length);
    const must: Array<Record<string, unknown>> = [{
      key: 'record_type',
      match: { value: opts.type },
    }];
    if (opts.type === 'episodic' && opts.sessionId) {
      must.push({ key: 'session_id', match: { value: opts.sessionId } });
    }

    const data = await requestJson(
      `${this.url}/collections/${encodeURIComponent(this.collection)}/points/search`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          vector: Array.from(opts.vector),
          limit: opts.limit,
          with_payload: true,
          with_vectors: false,
          filter: must.length > 0 ? { must } : undefined,
        }),
      },
    ) as {
      result?: Array<{ id: string | number; score?: number; payload?: Record<string, unknown> }>;
    };

    return (data.result ?? []).map((item) =>
      payloadToHit(item.payload, String(item.id), opts.type, item.score ?? 0)
    );
  }

  async health(): Promise<{ ok: boolean; detail?: string }> {
    try {
      await requestJson(`${this.url}/collections/${encodeURIComponent(this.collection)}`, {
        headers: this.headers(),
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
  }
}

class PineconeVectorStore implements MemoryVectorStore {
  readonly name = 'pinecone';
  private host: string;
  private apiKey?: string;
  private namespace?: string;

  constructor(cfg: NonNullable<StoreConfig> & { kind: 'pinecone' }) {
    this.host = cfg.url ? normaliseBaseUrl(cfg.url, '') : 'https://api.pinecone.io';
    this.apiKey = cfg.apiKey;
    this.namespace = cfg.namespace;
  }

  private headers(): HeadersInit {
    return {
      'Api-Key': this.apiKey ?? '',
      'X-Pinecone-Api-Version': '2025-10',
    };
  }

  async ensureReady(_dims: number): Promise<void> {
    // Pinecone indexes are provisioned out-of-band.
  }

  async upsert(record: VectorMemoryRecord): Promise<void> {
    await requestJson(`${this.host}/vectors/upsert`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        namespace: this.namespace,
        vectors: [{
          id: record.id,
          values: Array.from(record.embedding),
          metadata: payloadFromRecord(record),
        }],
      }),
    });
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await requestJson(`${this.host}/vectors/delete`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ namespace: this.namespace, ids }),
    });
  }

  async search(opts: VectorStoreOptions): Promise<VectorMemoryHit[]> {
    const data = await requestJson(`${this.host}/query`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        namespace: this.namespace,
        vector: Array.from(opts.vector),
        topK: opts.limit,
        includeMetadata: true,
        filter: {
          record_type: { $eq: opts.type },
          ...(opts.type === 'episodic' && opts.sessionId
            ? { session_id: { $eq: opts.sessionId } }
            : {}),
        },
      }),
    }) as { matches?: Array<{ id: string; score?: number; metadata?: Record<string, unknown> }> };

    return (data.matches ?? []).map((item) =>
      payloadToHit(item.metadata, item.id, opts.type, item.score ?? 0)
    );
  }

  async health(): Promise<{ ok: boolean; detail?: string }> {
    try {
      await requestJson(`${this.host}/describe_index_stats`, { headers: this.headers() });
      return { ok: true };
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
  }
}

class ChromaVectorStore implements MemoryVectorStore {
  readonly name = 'chromadb';
  private baseUrl: string;
  private apiKey?: string;
  private tenant: string;
  private database: string;
  private collection: string;
  private collectionId: string | null = null;
  private resolvePromise: Promise<string> | null = null;

  constructor(cfg: NonNullable<StoreConfig> & { kind: 'chromadb' }) {
    this.baseUrl = normaliseBaseUrl(cfg.url, 'http://localhost:8000');
    this.apiKey = cfg.apiKey;
    this.tenant = cfg.tenant ?? 'default_tenant';
    this.database = cfg.database ?? 'default_database';
    this.collection = cfg.collection ?? 'cortex_memory';
  }

  private headers(): HeadersInit {
    return this.apiKey
      ? { Authorization: `Bearer ${this.apiKey}`, 'x-chroma-token': this.apiKey }
      : {};
  }

  private collectionBase(): string {
    return `${this.baseUrl}/api/v2/tenants/${encodeURIComponent(this.tenant)}/databases/${
      encodeURIComponent(this.database)
    }`;
  }

  private async listCollections(): Promise<Array<{ id: string; name: string }>> {
    return await requestJson(`${this.collectionBase()}/collections`, {
      headers: this.headers(),
    }) as Array<{
      id: string;
      name: string;
    }>;
  }

  private async resolveCollectionId(): Promise<string> {
    if (this.collectionId) return this.collectionId;
    if (this.resolvePromise) return await this.resolvePromise;

    this.resolvePromise = (async () => {
      const existing = await this.listCollections().catch(() =>
        [] as Array<{ id: string; name: string }>
      );
      const found = existing.find((col) => col.name === this.collection);
      if (found) {
        this.collectionId = found.id;
        return found.id;
      }

      const created = await requestJson(`${this.collectionBase()}/collections`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ name: this.collection }),
      }).catch(() => null) as { id?: string; name?: string } | null;

      if (created?.id) {
        this.collectionId = created.id;
        return created.id;
      }

      const retry = await this.listCollections().catch(() =>
        [] as Array<{ id: string; name: string }>
      );
      const retryFound = retry.find((col) => col.name === this.collection);
      if (retryFound) {
        this.collectionId = retryFound.id;
        return retryFound.id;
      }

      throw new Error(`Unable to resolve Chroma collection: ${this.collection}`);
    })();

    return await this.resolvePromise;
  }

  async ensureReady(_dims: number): Promise<void> {
    await this.resolveCollectionId();
  }

  async upsert(record: VectorMemoryRecord): Promise<void> {
    const collectionId = await this.resolveCollectionId();
    await requestJson(
      `${this.collectionBase()}/collections/${encodeURIComponent(collectionId)}/upsert`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          ids: [record.id],
          embeddings: [Array.from(record.embedding)],
          documents: [record.text],
          metadatas: [payloadFromRecord(record)],
        }),
      },
    );
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const collectionId = await this.resolveCollectionId();
    await requestJson(
      `${this.collectionBase()}/collections/${encodeURIComponent(collectionId)}/delete`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ ids }),
      },
    );
  }

  async search(opts: VectorStoreOptions): Promise<VectorMemoryHit[]> {
    const collectionId = await this.resolveCollectionId();
    const where: Record<string, unknown> = { record_type: opts.type };
    if (opts.type === 'episodic' && opts.sessionId) where.session_id = opts.sessionId;

    const data = await requestJson(
      `${this.collectionBase()}/collections/${encodeURIComponent(collectionId)}/query`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          query_embeddings: [Array.from(opts.vector)],
          n_results: opts.limit,
          where,
          include: ['documents', 'metadatas', 'distances'],
        }),
      },
    ) as {
      ids?: string[][];
      documents?: (string[] | null)[];
      metadatas?: (Record<string, unknown>[] | null)[];
      distances?: (number[] | null)[];
    };

    const ids = data.ids?.[0] ?? [];
    const docs = data.documents?.[0] ?? [];
    const metas = data.metadatas?.[0] ?? [];
    const distances = data.distances?.[0] ?? [];
    const count = Math.max(ids.length, docs.length, metas.length, distances.length);
    const hits: VectorMemoryHit[] = [];
    for (let i = 0; i < count; i++) {
      const id = ids[i];
      if (!id) continue;
      hits.push(
        payloadToHit(
          metas[i] ?? null,
          id,
          opts.type,
          1 / (1 + (distances[i] ?? 0)),
        ),
      );
      if (!hits[hits.length - 1].text && typeof docs[i] === 'string') {
        hits[hits.length - 1].text = docs[i] as string;
      }
    }
    return hits;
  }

  async health(): Promise<{ ok: boolean; detail?: string }> {
    try {
      await requestJson(`${this.baseUrl}/heartbeat`, { headers: this.headers() });
      return { ok: true };
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
  }
}

export function buildMemoryVectorStore(config: CortexConfig): MemoryVectorStore | null {
  const store = config.memory?.vectorStore;
  if (!store || store.kind === 'sqlite') return null;

  switch (store.kind) {
    case 'qdrant':
      return new QdrantVectorStore(store as typeof store & { kind: 'qdrant' });
    case 'chromadb':
      return new ChromaVectorStore(store as typeof store & { kind: 'chromadb' });
    case 'pinecone':
      return new PineconeVectorStore(store as typeof store & { kind: 'pinecone' });
  }

  return null;
}

let cachedStoreKey = '';
let cachedStorePromise: Promise<MemoryVectorStore | null> | null = null;

export async function getMemoryVectorStore(): Promise<MemoryVectorStore | null> {
  const config = await loadConfig();
  const key = JSON.stringify(config.memory?.vectorStore ?? null);
  if (!cachedStorePromise || cachedStoreKey !== key) {
    cachedStoreKey = key;
    cachedStorePromise = Promise.resolve(buildMemoryVectorStore(config)).catch(() => null);
  }
  return await cachedStorePromise;
}
