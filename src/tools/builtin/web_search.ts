import type { Tool, ToolCallResult, ToolContext } from '../types.ts';

const DDG_URL = 'https://api.duckduckgo.com/';
const MAX_RESULTS = 8;

interface DdgResult {
  Text?: string;
  FirstURL?: string;
  Result?: string;
}

interface DdgResponse {
  AbstractText?: string;
  AbstractURL?: string;
  RelatedTopics?: Array<DdgResult & { Topics?: DdgResult[] }>;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
}

export const webSearchTool: Tool = {
  definition: {
    name: 'web_search',
    description:
      'Search the web via DuckDuckGo Instant Answers. Returns a concise summary and related links. Best for factual lookups.',
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
        description: `Maximum number of results to return (default ${MAX_RESULTS})`,
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

    if (!query) {
      return result(false, '', 'No query provided', start);
    }

    try {
      const url = new URL(DDG_URL);
      url.searchParams.set('q', query);
      url.searchParams.set('format', 'json');
      url.searchParams.set('no_redirect', '1');
      url.searchParams.set('no_html', '1');
      url.searchParams.set('skip_disambig', '1');

      const res = await fetch(url.toString(), {
        headers: { 'User-Agent': 'CortexPrism/0.1' },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        return result(false, '', `DDG returned ${res.status}`, start);
      }

      const data = await res.json() as DdgResponse;
      const lines: string[] = [];

      if (data.AbstractText) {
        lines.push(`**Summary:** ${data.AbstractText}`);
        if (data.AbstractURL) lines.push(`**Source:** ${data.AbstractURL}`);
        lines.push('');
      }

      const topics = (data.RelatedTopics ?? [])
        .flatMap((t) => (t.Topics ? t.Topics : [t]))
        .filter((t) => t.Text && t.FirstURL)
        .slice(0, maxResults);

      if (topics.length > 0) {
        lines.push('**Related:**');
        for (const t of topics) {
          lines.push(`- ${stripHtml(t.Text ?? '')}  \n  ${t.FirstURL}`);
        }
      }

      if (lines.length === 0) {
        lines.push(`No results found for: "${query}"`);
      }

      return result(true, lines.join('\n'), undefined, start);
    } catch (err) {
      return result(false, '', (err as Error).message, start);
    }
  },
};

function result(
  success: boolean,
  output: string,
  error: string | undefined,
  startMs: number,
): ToolCallResult {
  return {
    toolName: 'web_search',
    success,
    output,
    error,
    durationMs: Date.now() - startMs,
  };
}

export default webSearchTool;
