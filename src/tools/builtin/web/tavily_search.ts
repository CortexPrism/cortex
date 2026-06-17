import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';

const TAVILY_API_URL = 'https://api.tavily.com/search';
const MAX_RESULTS = 5;

async function getApiKey(): Promise<string | null> {
  const envKey = Deno.env.get('TAVILY_API_KEY');
  if (envKey) return envKey;
  try {
    const { vaultGet } = await import('../../../security/vault.ts');
    return await vaultGet('tavily_api_key');
  } catch {
    return null;
  }
}

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
  published_date?: string;
}

interface TavilyResponse {
  query?: string;
  answer?: string;
  results?: TavilyResult[];
}

export const tavilySearchTool: Tool = {
  definition: {
    name: 'tavily_search',
    description:
      'Search the web using Tavily AI Search — optimised for LLM agents. Returns AI-curated results with clean content snippets and an optional direct answer. Best for research, fact-checking, and comparative analysis. Requires TAVILY_API_KEY env var or vault entry "tavily_api_key".',
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
        description: `Number of results to return (default ${MAX_RESULTS}, max 10)`,
        required: false,
      },
      {
        name: 'search_depth',
        type: 'string',
        description: '"basic" (faster, default) or "advanced" (deeper, uses more API credits)',
        required: false,
      },
      {
        name: 'include_answer',
        type: 'boolean',
        description: 'Include a direct AI-generated answer in the response (default true)',
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
      10,
    );
    const searchDepth = args.search_depth === 'advanced' ? 'advanced' : 'basic';
    const includeAnswer = args.include_answer !== false;

    if (!query) {
      return mkResult(false, '', 'No query provided', start);
    }

    const apiKey = await getApiKey();
    if (!apiKey) {
      return mkResult(
        false,
        '',
        'Tavily API key not configured. Set TAVILY_API_KEY env var or store "tavily_api_key" in the vault.',
        start,
      );
    }

    try {
      const res = await fetch(TAVILY_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          query,
          max_results: maxResults,
          search_depth: searchDepth,
          include_answer: includeAnswer,
          include_raw_content: false,
        }),
        signal: AbortSignal.timeout(20_000),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return mkResult(false, '', `Tavily returned HTTP ${res.status}: ${body.slice(0, 200)}`, start);
      }

      const data = await res.json() as TavilyResponse;
      const lines: string[] = [`**Tavily Search results for:** "${query}"\n`];

      if (data.answer) {
        lines.push(`**Direct Answer:** ${data.answer}\n`);
      }

      const results = data.results ?? [];
      if (results.length === 0 && !data.answer) {
        return mkResult(true, `No results found for: "${query}"`, undefined, start);
      }

      if (results.length > 0) {
        lines.push('**Sources:**');
        for (const [i, r] of results.entries()) {
          lines.push(`\n**${i + 1}. ${r.title ?? 'Untitled'}**`);
          lines.push(`URL: ${r.url ?? ''}`);
          if (r.published_date) lines.push(`Published: ${r.published_date}`);
          if (r.content) lines.push(r.content.slice(0, 500));
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
  return { toolName: 'tavily_search', success, output, error, durationMs: Date.now() - startMs };
}

export default tavilySearchTool;
