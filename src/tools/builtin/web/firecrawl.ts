import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';

const FIRECRAWL_BASE = 'https://api.firecrawl.dev/v1';
const MAX_CONTENT = 50_000;

async function getApiKey(): Promise<string | null> {
  const envKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (envKey) return envKey;
  try {
    const { vaultGet } = await import('../../../security/vault.ts');
    return await vaultGet('firecrawl_api_key');
  } catch {
    return null;
  }
}

interface FirecrawlScrapeResponse {
  success?: boolean;
  data?: {
    markdown?: string;
    content?: string;
    metadata?: {
      title?: string;
      description?: string;
      sourceURL?: string;
    };
  };
  error?: string;
}

interface FirecrawlSearchResponse {
  success?: boolean;
  data?: Array<{
    url?: string;
    title?: string;
    description?: string;
    markdown?: string;
  }>;
  error?: string;
}

export const firecrawlTool: Tool = {
  definition: {
    name: 'firecrawl',
    description:
      'Deep-crawl and extract clean Markdown content from any URL, or search the web and return full page content (not just snippets). Use for extracting full article text, documentation, or rich content from a specific page. Requires FIRECRAWL_API_KEY env var or vault entry "firecrawl_api_key".',
    capabilities: ['network:fetch'],
    params: [
      {
        name: 'mode',
        type: 'string',
        description: '"scrape" to extract content from a specific URL, or "search" to search the web and return page content',
        required: true,
      },
      {
        name: 'url',
        type: 'string',
        description: 'The URL to scrape (required when mode="scrape")',
        required: false,
      },
      {
        name: 'query',
        type: 'string',
        description: 'The search query (required when mode="search")',
        required: false,
      },
      {
        name: 'max_results',
        type: 'number',
        description: 'Number of search results to return when mode="search" (default 5, max 10)',
        required: false,
      },
      {
        name: 'only_main_content',
        type: 'boolean',
        description: 'Strip navigation, footers etc. and return only main body content (default true)',
        required: false,
      },
    ],
  },

  async execute(
    args: Record<string, unknown>,
    _context: ToolContext,
  ): Promise<ToolCallResult> {
    const start = Date.now();
    const mode = String(args.mode ?? 'scrape');
    const onlyMainContent = args.only_main_content !== false;

    const apiKey = await getApiKey();
    if (!apiKey) {
      return mkResult(
        false,
        '',
        'Firecrawl API key not configured. Set FIRECRAWL_API_KEY env var or store "firecrawl_api_key" in the vault.',
        start,
      );
    }

    if (mode === 'scrape') {
      const url = String(args.url ?? '').trim();
      if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
        return mkResult(false, '', 'A valid URL (http/https) is required for mode="scrape"', start);
      }

      try {
        const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            url,
            formats: ['markdown'],
            onlyMainContent,
          }),
          signal: AbortSignal.timeout(30_000),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          return mkResult(false, '', `Firecrawl returned HTTP ${res.status}: ${body.slice(0, 200)}`, start);
        }

        const data = await res.json() as FirecrawlScrapeResponse;
        if (!data.success) {
          return mkResult(false, '', data.error ?? 'Firecrawl scrape failed', start);
        }

        const content = data.data?.markdown ?? data.data?.content ?? '';
        const title = data.data?.metadata?.title ?? url;
        const description = data.data?.metadata?.description ?? '';

        const lines = [`**${title}**`];
        if (description) lines.push(`_${description}_`);
        lines.push(`Source: ${url}\n`);
        lines.push(content.slice(0, MAX_CONTENT));
        if (content.length > MAX_CONTENT) {
          lines.push(`\n[... truncated — ${content.length - MAX_CONTENT} chars omitted]`);
        }

        return mkResult(true, lines.join('\n'), undefined, start);
      } catch (err) {
        return mkResult(false, '', (err as Error).message, start);
      }
    }

    if (mode === 'search') {
      const query = String(args.query ?? '').trim();
      if (!query) {
        return mkResult(false, '', 'A search query is required for mode="search"', start);
      }
      const maxResults = Math.min(
        typeof args.max_results === 'number' ? args.max_results : 5,
        10,
      );

      try {
        const res = await fetch(`${FIRECRAWL_BASE}/search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            query,
            limit: maxResults,
            scrapeOptions: { formats: ['markdown'], onlyMainContent },
          }),
          signal: AbortSignal.timeout(40_000),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          return mkResult(false, '', `Firecrawl search returned HTTP ${res.status}: ${body.slice(0, 200)}`, start);
        }

        const data = await res.json() as FirecrawlSearchResponse;
        if (!data.success) {
          return mkResult(false, '', data.error ?? 'Firecrawl search failed', start);
        }

        const results = data.data ?? [];
        if (results.length === 0) {
          return mkResult(true, `No results found for: "${query}"`, undefined, start);
        }

        const lines: string[] = [`**Firecrawl search results for:** "${query}"\n`];
        for (const [i, r] of results.entries()) {
          lines.push(`**${i + 1}. ${r.title ?? 'Untitled'}**`);
          lines.push(`URL: ${r.url ?? ''}`);
          if (r.description) lines.push(r.description);
          if (r.markdown) lines.push(`\n${r.markdown.slice(0, 1000)}`);
          lines.push('');
        }

        return mkResult(true, lines.join('\n'), undefined, start);
      } catch (err) {
        return mkResult(false, '', (err as Error).message, start);
      }
    }

    return mkResult(false, '', `Unknown mode: "${mode}". Use "scrape" or "search".`, start);
  },
};

function mkResult(
  success: boolean,
  output: string,
  error: string | undefined,
  startMs: number,
): ToolCallResult {
  return { toolName: 'firecrawl', success, output, error, durationMs: Date.now() - startMs };
}

export default firecrawlTool;
