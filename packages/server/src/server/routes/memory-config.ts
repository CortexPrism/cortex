import { type RouteHandler, json, type err } from './_helpers.ts';
import { getMemoryDb } from '../../../../../src/db/client.ts';
import { getMemoryHealth } from '../../../../../src/memory/heuristics.ts';
import { listReflections } from '../../../../../src/agent/reflect.ts';
import { loadConfig, saveConfig } from '../../../../../src/config/config.ts';
import type { EmbeddingConfig, MemoryConfig, MemoryVectorStoreConfig } from '../../../../../src/config/config.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/memory\/stats$/,
    handler: async () => {
      const db = await getMemoryDb();
      const [ep, sem, ref, proc] = await Promise.all([
        db.get<{ count: number }>(`SELECT COUNT(*) as count FROM episodic_memory`),
        db.get<{ count: number }>(`SELECT COUNT(*) as count FROM semantic_memory`),
        db.get<{ count: number }>(`SELECT COUNT(*) as count FROM reflection_memory`),
        db.get<{ count: number }>(`SELECT COUNT(*) as count FROM procedural_memory`),
      ]);
      return json({
        episodic: ep?.count ?? 0,
        semantic: sem?.count ?? 0,
        reflection: ref?.count ?? 0,
        procedural: proc?.count ?? 0,
      });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/memory\/health$/,
    handler: async () => {
      const health = await getMemoryHealth();
      return json(health);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/memory\/reflections$/,
    handler: async () => {
      const reflections = await listReflections(50);
      return json(reflections);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/memory\/privacy$/,
    handler: async () => {
      const config = await loadConfig() as unknown as Record<string, unknown>;
      const mem = (config.memory as Record<string, unknown>) || {};
      return json({
        piiRedaction: mem.piiRedaction !== false,
        maxRetentionDays: (mem.maxRetentionDays as number) || 90,
      });
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/memory\/privacy$/,
    handler: async (req) => {
      const body = await req.json() as { piiRedaction?: boolean; maxRetentionDays?: number };
      const config = await loadConfig();
      const mem = config.memory || {};
      await saveConfig({
        ...config,
        memory: {
          ...mem,
          piiRedaction: body.piiRedaction,
          maxRetentionDays: body.maxRetentionDays,
        } as MemoryConfig,
      });
      return json({ ok: true });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/memory\/heuristics$/,
    handler: async () => {
      const { getHeuristicCatalog } = await import('../../../../../src/memory/heuristics.ts');
      const catalog = getHeuristicCatalog();
      return json({ catalog, ruleCount: catalog.reduce((s, c) => s + (c.patterns || 0), 0) });
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/memory\/heuristics$/,
    handler: async () => {
      const { runHeuristicCycle } = await import('../../../../../src/memory/heuristics.ts');
      const affected = await runHeuristicCycle();
      return json({ affected });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/memory\/embeddings$/,
    handler: async () => {
      const config = await loadConfig();
      const emb = config.embeddings;
      return json({
        current: {
          provider: emb?.provider || 'stub',
          model: emb?.model || '',
          baseUrl: emb?.baseUrl || '',
          apiKey: emb?.apiKey || '',
          dimensions: emb?.dimensions || 64,
        },
        options: [{ provider: 'stub', label: 'Stub / Local fallback' }, {
          provider: 'ollama',
          label: 'Ollama',
        }, { provider: 'openai', label: 'OpenAI' }],
      });
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/memory\/embeddings$/,
    handler: async (req) => {
      const body = await req.json() as {
        provider?: string;
        model?: string;
        baseUrl?: string;
        apiKey?: string;
        dimensions?: number;
      };
      const config = await loadConfig();
      await saveConfig({
        ...config,
        embeddings: {
          provider:
            (body.provider || config.embeddings?.provider || 'stub') as EmbeddingConfig['provider'],
          model: body.model,
          baseUrl: body.baseUrl,
          apiKey: body.apiKey,
          dimensions: body.dimensions ?? config.embeddings?.dimensions,
        },
      });
      return json({ ok: true });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/memory\/vector-store$/,
    handler: async () => {
      const config = await loadConfig();
      const vs = config.memory?.vectorStore;
      return json({
        current: {
          kind: vs?.kind || 'sqlite',
          url: vs?.url || '',
          apiKey: vs?.apiKey || '',
          collection: vs?.collection || '',
        },
        options: [
          { kind: 'sqlite', label: 'SQLite', description: 'Local file-backed fallback' },
          { kind: 'qdrant', label: 'Qdrant', description: 'Vector DB with payload filters' },
          { kind: 'chromadb', label: 'ChromaDB', description: 'Collection-based vector store' },
          { kind: 'pinecone', label: 'Pinecone', description: 'Managed hosted vector index' },
        ],
        health: { ok: !!vs?.url || (vs?.kind || 'sqlite') === 'sqlite' },
      });
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/memory\/vector-store$/,
    handler: async (req) => {
      const body = await req.json() as {
        kind?: string;
        url?: string;
        apiKey?: string;
        collection?: string;
      };
      const config = await loadConfig();
      await saveConfig({
        ...config,
        memory: {
          ...config.memory,
          vectorStore: {
            kind: (body.kind || 'sqlite') as MemoryVectorStoreConfig['kind'],
            url: body.url,
            apiKey: body.apiKey,
            collection: body.collection,
          },
        },
      });
      return json({ ok: true });
    },
  },
];
