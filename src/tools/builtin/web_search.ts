import type { Tool, ToolCallResult, ToolContext } from '../types.ts';

const DDG_API_URL = 'https://api.duckduckgo.com/';
const DDG_HTML_URL = 'https://html.duckduckgo.com/html/';
const MAX_RESULTS = 8;

interface DdgResult {
  Text?: string;
  FirstURL?: string;
}

interface DdgApiResponse {
  AbstractText?: string;
  AbstractURL?: string;
  RelatedTopics?: Array<DdgResult & { Topics?: DdgResult[] }>;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").trim();
}

async function instantAnswers(
  query: string,
  maxResults: number,
): Promise<{ lines: string[]; hasContent: boolean }> {
  const url = new URL(DDG_API_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('no_redirect', '1');
  url.searchParams.set('no_html', '1');
  url.searchParams.set('skip_disambig', '1');

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'CortexPrism/1.0' },
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) return { lines: [], hasContent: false };

  const data = await res.json() as DdgApiResponse;
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

  return { lines, hasContent: lines.length > 0 };
}

async function htmlSearch(
  query: string,
  maxResults: number,
): Promise<{ lines: string[]; hasContent: boolean }> {
  const body = new URLSearchParams({ q: query, b: '' });

  const res = await fetch(DDG_HTML_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (compatible; CortexPrism/1.0)',
      'Accept': 'text/html',
    },
    body: body.toString(),
    signal: AbortSignal.timeout(12_000),
  });

  if (!res.ok) return { lines: [], hasContent: false };

  const html = await res.text();

  const resultPattern = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetPattern = /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;

  const titles: Array<{ url: string; title: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = resultPattern.exec(html)) !== null && titles.length < maxResults) {
    const url = m[1].startsWith('//') ? `https:${m[1]}` : m[1];
    const title = stripHtml(m[2]);
    if (title && url.startsWith('http')) {
      titles.push({ url, title });
    }
  }

  const snippets: string[] = [];
  while ((m = snippetPattern.exec(html)) !== null && snippets.length < maxResults) {
    snippets.push(stripHtml(m[1]));
  }

  if (titles.length === 0) return { lines: [], hasContent: false };

  const lines: string[] = ['**DuckDuckGo Search Results:**\n'];
  for (let i = 0; i < titles.length; i++) {
    lines.push(`**${i + 1}. ${titles[i].title}**`);
    lines.push(`URL: ${titles[i].url}`);
    if (snippets[i]) lines.push(snippets[i]);
    lines.push('');
  }

  return { lines, hasContent: true };
}

export const webSearchTool: Tool = {
  definition: {
    name: 'web_search',
    description:
      'Free web search via DuckDuckGo. Tries Instant Answers first (great for factual lookups), then falls back to full HTML search results (works for comparative research, current events, and open-ended queries). No API key required. For richer results consider brave_search, tavily_search, or serpapi_search.',
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
      return mkResult(false, '', 'No query provided', start);
    }

    try {
      const instant = await instantAnswers(query, maxResults);
      if (instant.hasContent) {
        return mkResult(true, instant.lines.join('\n'), undefined, start);
      }

      const html = await htmlSearch(query, maxResults);
      if (html.hasContent) {
        return mkResult(true, html.lines.join('\n'), undefined, start);
      }

      return mkResult(
        true,
        `No results found for: "${query}". Try a different query or use brave_search / tavily_search for better coverage.`,
        undefined,
        start,
      );
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
  return {
    toolName: 'web_search',
    success,
    output,
    error,
    durationMs: Date.now() - startMs,
  };
}

export default webSearchTool;
