import type { EmbeddingProvider } from './embeddings.ts';
import { type MemoryHit, retrieve } from './store.ts';

const MEMORY_SECTION_MARKER = '\n\n---\n\n## Relevant Memory\n\n';

export async function injectMemory(
  systemPrompt: string,
  query: string,
  embedder: EmbeddingProvider | null,
  opts: { limit?: number } = {},
): Promise<string> {
  const hits = await retrieve(query, embedder, { limit: opts.limit ?? 5 });
  if (hits.length === 0) return systemPrompt;

  const lines = hits.map((h) => formatHit(h));
  return systemPrompt + MEMORY_SECTION_MARKER + lines.join('\n\n');
}

function formatHit(hit: MemoryHit): string {
  const age = formatAge(hit.created_at);
  const label = hit.type === 'episodic' ? 'Past conversation' : 'Knowledge';

  const meta: string[] = [];
  if (hit.category && hit.category !== 'general') meta.push(`category:${hit.category}`);
  if (hit.tags && hit.tags.length > 0) meta.push(`tags:${hit.tags.slice(0, 3).join(',')}`);
  if (hit.topics && hit.topics.length > 0) meta.push(`topics:${hit.topics.slice(0, 3).join(',')}`);
  if (hit.entities && hit.entities.length > 0) meta.push(`entities:${hit.entities.slice(0, 3).join(',')}`);

  const metaStr = meta.length > 0 ? ` · ${meta.join(' · ')}` : '';
  return `**[${label} · ${age}${metaStr}]** ${hit.text.slice(0, 400)}`;
}

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  const hrs = Math.floor(ms / 3_600_000);
  const days = Math.floor(ms / 86_400_000);
  if (days > 0) return `${days}d ago`;
  if (hrs > 0) return `${hrs}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return 'just now';
}
