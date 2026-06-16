import type { Tool, ToolCallResult, ToolContext } from '../types.ts';

const TIMEOUT_MS = 30_000;
const MAX_CONTENT_LENGTH = 100_000;

export const webFetchTool: Tool = {
  definition: {
    name: 'web_fetch',
    description: 'Fetch a web page and return its content as plain text (HTML tags stripped). Use for reading documentation, articles, or any web page.',
    capabilities: ['network:fetch'],
    params: [
      {
        name: 'url',
        type: 'string',
        description: 'The URL to fetch (must start with http:// or https://)',
        required: true,
      },
      {
        name: 'maxLength',
        type: 'number',
        description: `Maximum number of characters to return (default: ${MAX_CONTENT_LENGTH})`,
        required: false,
      },
    ],
  },

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();
    const url = String(args.url ?? '').trim();
    const maxLength = typeof args.maxLength === 'number' ? args.maxLength : MAX_CONTENT_LENGTH;

    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      return {
        toolName: 'web_fetch',
        success: false,
        output: '',
        error: 'URL must start with http:// or https://',
        durationMs: Date.now() - start,
      };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'CortexPrism/1.0 (web_fetch tool)',
          'Accept': 'text/html,text/plain,*/*',
        },
      });

      clearTimeout(timer);

      if (!res.ok) {
        return {
          toolName: 'web_fetch',
          success: false,
          output: '',
          error: `HTTP ${res.status} ${res.statusText}`,
          durationMs: Date.now() - start,
        };
      }

      const contentType = res.headers.get('content-type') ?? '';
      const isText = contentType.includes('text/') || contentType.includes('json') ||
        contentType.includes('xml') || contentType.includes('javascript');

      if (!isText) {
        return {
          toolName: 'web_fetch',
          success: false,
          output: '',
          error: `Cannot fetch binary content type: ${contentType}`,
          durationMs: Date.now() - start,
        };
      }

      const text = await res.text();
      const stripped = stripHtml(text);
      const truncated = stripped.length > maxLength
        ? stripped.slice(0, maxLength) + `\n[... truncated at ${maxLength} chars, ${stripped.length} total]`
        : stripped;

      return {
        toolName: 'web_fetch',
        success: true,
        output: truncated,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        toolName: 'web_fetch',
        success: false,
        output: '',
        error: (err as Error).message || 'Network error',
        durationMs: Date.now() - start,
      };
    }
  },
};

function stripHtml(html: string): string {
  let text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();

  const lines = text.split('\n');
  const deduped: string[] = [];
  for (const line of lines) {
    const cleaned = line.trim();
    if (cleaned && cleaned !== deduped[deduped.length - 1]) {
      deduped.push(cleaned);
    }
  }

  return deduped.join('\n');
}

export default webFetchTool;
