import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';

const MAX_RESULTS = 10;
const BRAVE_API_URL = 'https://api.search.brave.com/res/v1/web/search';

async function getApiKey(): Promise<string | null> {
  const envKey = Deno.env.get('BRAVE_SEARCH_API_KEY');
  if (envKey) return envKey;
  try {
    const { vaultGet } = await import('../../../security/vault.ts');
    return await vaultGet('brave_search_api_key');
  } catch {
    return null;
  }
}

interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
}

interface BraveResponse {
  web?: {
    results?: BraveWebResult[];
  };
  query?: {
    original?: string;
  };
}

export const braveSearchTool: Tool = {
  definition: {
    name: 'brave_search',
    description:
      'Search the web using the Brave Search API. Returns real search results with titles, URLs, and descriptions. Excellent for comparative research, current events, and any query that needs actual web results. Requires BRAVE_SEARCH_API_KEY env var or vault entry "brave_search_api_key".',
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
        description: `Maximum number of results to return (default ${MAX_RESULTS}, max 20)`,
        required: false,
      },
      {
        name: 'country',
        type: 'string',
        description: 'Country code for localised results, e.g. "US", "GB" (default: "US")',
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
    const maxResults = Math.min(
      typeof args.max_results === 'number' ? args.max_results : MAX_RESULTS,
      20,
    );
    const country = String(args.country ?? 'US').toUpperCase();

    if (!query) {
      return mkResult(false, '', 'No query provided', start);
    }

    const apiKey = await getApiKey();
    if (!apiKey) {
      return mkResult(
        false,
        '',
        'Brave Search API key not configured. Set BRAVE_SEARCH_API_KEY env var or store "brave_search_api_key" in the vault.',
        start,
      );
    }

    try {
      const url = new URL(BRAVE_API_URL);
      url.searchParams.set('q', query);
      url.searchParams.set('count', String(maxResults));
      url.searchParams.set('country', country);
      url.searchParams.set('search_lang', 'en');

      const res = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey,
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        return mkResult(false, '', `Brave Search returned HTTP ${res.status}: ${res.statusText}`, start);
      }

      const data = await res.json() as BraveResponse;
      const results = data.web?.results ?? [];

      if (results.length === 0) {
        return mkResult(true, `No results found for: "${query}"`, undefined, start);
      }

      const lines: string[] = [`**Brave Search results for:** "${query}"\n`];
      for (const [i, r] of results.entries()) {
        lines.push(`**${i + 1}. ${r.title ?? 'Untitled'}**`);
        lines.push(`URL: ${r.url ?? ''}`);
        if (r.description) lines.push(r.description);
        lines.push('');
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
  return { toolName: 'brave_search', success, output, error, durationMs: Date.now() - startMs };
}

export default braveSearchTool;
