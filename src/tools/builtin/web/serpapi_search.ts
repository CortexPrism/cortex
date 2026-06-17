import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';

const SERPAPI_URL = 'https://serpapi.com/search.json';
const MAX_RESULTS = 10;

async function getApiKey(): Promise<string | null> {
  const envKey = Deno.env.get('SERPAPI_API_KEY');
  if (envKey) return envKey;
  try {
    const { vaultGet } = await import('../../../security/vault.ts');
    return await vaultGet('serpapi_api_key');
  } catch {
    return null;
  }
}

interface SerpApiOrganicResult {
  position?: number;
  title?: string;
  link?: string;
  snippet?: string;
  date?: string;
}

interface SerpApiResponse {
  search_metadata?: { status?: string };
  organic_results?: SerpApiOrganicResult[];
  answer_box?: { answer?: string; snippet?: string; title?: string };
  knowledge_graph?: { title?: string; description?: string };
  error?: string;
}

export const serpapiSearchTool: Tool = {
  definition: {
    name: 'serpapi_search',
    description:
      'Search Google (or other engines) via SerpAPI. Returns structured organic results, answer boxes, and knowledge graph data. High-quality results for any query type. Requires SERPAPI_API_KEY env var or vault entry "serpapi_api_key".',
    capabilities: ['network:fetch'],
    params: [
      {
        name: 'query',
        type: 'string',
        description: 'The search query',
        required: true,
      },
      {
        name: 'max_results',
        type: 'number',
        description: `Maximum organic results to return (default ${MAX_RESULTS})`,
        required: false,
      },
      {
        name: 'engine',
        type: 'string',
        description: 'Search engine to use: "google" (default), "bing", "duckduckgo", "yahoo"',
        required: false,
      },
      {
        name: 'location',
        type: 'string',
        description: 'Location for localised results, e.g. "New York, New York, United States"',
        required: false,
      },
    ],
  },

  async execute(
    args: Record<string, unknown>,
    _context: ToolContext,
  ): Promise<ToolCallResult> {
    const start = Date.now();
    const query = String(args.query ?? '').trim();
    const maxResults = typeof args.max_results === 'number' ? args.max_results : MAX_RESULTS;
    const engine = String(args.engine ?? 'google');
    const location = args.location ? String(args.location) : undefined;

    if (!query) {
      return mkResult(false, '', 'No query provided', start);
    }

    const apiKey = await getApiKey();
    if (!apiKey) {
      return mkResult(
        false,
        '',
        'SerpAPI key not configured. Set SERPAPI_API_KEY env var or store "serpapi_api_key" in the vault.',
        start,
      );
    }

    try {
      const url = new URL(SERPAPI_URL);
      url.searchParams.set('q', query);
      url.searchParams.set('api_key', apiKey);
      url.searchParams.set('engine', engine);
      url.searchParams.set('num', String(maxResults));
      if (location) url.searchParams.set('location', location);

      const res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(20_000),
      });

      if (!res.ok) {
        return mkResult(false, '', `SerpAPI returned HTTP ${res.status}`, start);
      }

      const data = await res.json() as SerpApiResponse;

      if (data.error) {
        return mkResult(false, '', `SerpAPI error: ${data.error}`, start);
      }

      const lines: string[] = [`**SerpAPI (${engine}) results for:** "${query}"\n`];

      if (data.answer_box?.answer || data.answer_box?.snippet) {
        lines.push(`**Answer Box:** ${data.answer_box.answer ?? data.answer_box.snippet}`);
        lines.push('');
      }

      if (data.knowledge_graph?.description) {
        lines.push(
          `**Knowledge Graph — ${
            data.knowledge_graph.title ?? ''
          }:** ${data.knowledge_graph.description}`,
        );
        lines.push('');
      }

      const organicResults = (data.organic_results ?? []).slice(0, maxResults);
      if (organicResults.length === 0 && lines.length <= 2) {
        return mkResult(true, `No results found for: "${query}"`, undefined, start);
      }

      if (organicResults.length > 0) {
        lines.push('**Organic Results:**');
        for (const r of organicResults) {
          lines.push(`\n**${r.position ?? ''}. ${r.title ?? 'Untitled'}**`);
          lines.push(`URL: ${r.link ?? ''}`);
          if (r.date) lines.push(`Date: ${r.date}`);
          if (r.snippet) lines.push(r.snippet);
        }
      }

      return mkResult(true, lines.join('\n'), undefined, start);
    } catch (err) {
      return mkResult(false, '', (err as Error).message, start);
    }
  },
};

function mkResult(
  success: boolean,
  output: string,
  error: string | undefined,
  startMs: number,
): ToolCallResult {
  return { toolName: 'serpapi_search', success, output, error, durationMs: Date.now() - startMs };
}

export default serpapiSearchTool;
