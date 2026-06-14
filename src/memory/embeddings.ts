import type { CortexConfig } from '../config/config.ts';

export type EmbeddingVector = Float32Array;

export interface EmbeddingProvider {
  name: string;
  dims: number;
  embed(text: string): Promise<EmbeddingVector>;
  embedBatch(texts: string[]): Promise<EmbeddingVector[]>;
}

function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export function vectorToBlob(v: EmbeddingVector): Uint8Array {
  return new Uint8Array(v.buffer);
}

export function blobToVector(b: Uint8Array | null): EmbeddingVector | null {
  if (!b || b.byteLength === 0) return null;
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
}

export { cosineSimilarity };

class OllamaEmbedder implements EmbeddingProvider {
  name = 'ollama';
  dims = 768;
  private baseUrl: string;
  private model: string;

  constructor(baseUrl: string, model: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.model = model;
    if (model.startsWith('nomic') || model.startsWith('mxbai')) this.dims = 768;
    else if (model.startsWith('all-minilm')) this.dims = 384;
    else this.dims = 768;
  }

  async embed(text: string): Promise<EmbeddingVector> {
    const res = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Ollama embed failed: ${res.status}`);
    const data = await res.json() as { embeddings: number[][] };
    return new Float32Array(data.embeddings[0]);
  }

  async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
    return await Promise.all(texts.map((t) => this.embed(t)));
  }
}

class OpenAIEmbedder implements EmbeddingProvider {
  name = 'openai';
  dims = 1536;
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = 'text-embedding-3-small') {
    this.apiKey = apiKey;
    this.model = model;
    if (model.includes('large')) this.dims = 3072;
    else this.dims = 1536;
  }

  async embed(text: string): Promise<EmbeddingVector> {
    const [result] = await this.embedBatch([text]);
    return result;
  }

  async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: texts }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`OpenAI embed failed: ${res.status}`);
    const data = await res.json() as { data: Array<{ embedding: number[] }> };
    return data.data.map((d) => new Float32Array(d.embedding));
  }
}

class StubEmbedder implements EmbeddingProvider {
  name = 'stub';
  dims = 64;

  async embed(text: string): Promise<EmbeddingVector> {
    const v = new Float32Array(this.dims);
    for (let i = 0; i < text.length && i < this.dims; i++) {
      v[i % this.dims] += text.charCodeAt(i) / 255;
    }
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => x / norm) as EmbeddingVector;
  }

  async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
    return await Promise.all(texts.map((t) => this.embed(t)));
  }
}

export function buildEmbedder(config: CortexConfig): EmbeddingProvider {
  const provider = config.providers[config.defaultProvider];
  if (!provider) return new StubEmbedder();

  if (provider.kind === 'ollama') {
    const baseUrl = provider.baseUrl ?? 'http://localhost:11434';
    const embModel = (provider as { embeddingModel?: string }).embeddingModel ??
      'nomic-embed-text';
    return new OllamaEmbedder(baseUrl, embModel);
  }

  if (provider.kind === 'openai' && provider.apiKey) {
    return new OpenAIEmbedder(provider.apiKey, 'text-embedding-3-small');
  }

  return new StubEmbedder();
}
