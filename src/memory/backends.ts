import { retrieve as sqliteRetrieve, writeEpisodic as sqliteWrite, type MemoryHit } from './store.ts';
import type { EmbeddingProvider } from './embeddings.ts';

export interface MemoryBackend {
  readonly name: string;
  retrieve(query: string, embedder: EmbeddingProvider, opts?: { limit?: number }): Promise<MemoryHit[]>;
  write(params: { sessionId: string; summary: string; topics?: string[]; entities?: string[]; importance?: number; embedder?: EmbeddingProvider }): Promise<string>;
}

let activeBackend: MemoryBackend | null = null;

export function registerMemoryBackend(backend: MemoryBackend): void {
  activeBackend = backend;
  console.log(`[memory] Registered backend: ${backend.name}`);
}

export function getActiveBackend(): MemoryBackend {
  if (activeBackend) return activeBackend;

  return {
    name: 'sqlite',
    retrieve: sqliteRetrieve,
    write: sqliteWrite,
  };
}

export function listBackends(): string[] {
  const backends = ['sqlite'];
  if (activeBackend && activeBackend.name !== 'sqlite') {
    backends.push(activeBackend.name);
  }
  return backends;
}
