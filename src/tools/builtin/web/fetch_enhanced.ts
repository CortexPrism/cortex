import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';

const TIMEOUT_MS = 30_000;
const MAX_CONTENT_LENGTH = 100_000;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

interface FetchOptions {
  url: string;
  maxLength: number;
  format: 'text' | 'markdown' | 'html';
  followRedirects: boolean;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function htmlToMarkdown(html: string): string {
  let md = html;

  // Remove script, style, head tags
  md = md.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  md = md.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  md = md.replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, '');

  // Convert headers
  md = md.replace(/<h1\b[^>]*>(.*?)<\/h1>/gi, '\n# $1\n');
  md = md.replace(/<h2\b[^>]*>(.*?)<\/h2>/gi, '\n## $1\n');
  md = md.replace(/<h3\b[^>]*>(.*?)<\/h3>/gi, '\n### $1\n');
  md = md.replace(/<h4\b[^>]*>(.*?)<\/h4>/gi, '\n#### $1\n');
  md = md.replace(/<h5\b[^>]*>(.*?)<\/h5>/gi, '\n##### $1\n');
  md = md.replace(/<h6\b[^>]*>(.*?)<\/h6>/gi, '\n###### $1\n');

  // Convert links
  md = md.replace(/<a\b[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)');

  // Convert images
  md = md.replace(/<img\b[^>]*alt=["']([^"']*)["'][^>]*src=["']([^"']*)["'][^>]*>/gi, '![$1]($2)');
  md = md.replace(/<img\b[^>]*src=["']([^"']*)["'][^>]*alt=["']([^"']*)["'][^>]*>/gi, '![$2]($1)');
  md = md.replace(/<img\b[^>]*src=["']([^"']*)["'][^>]*>/gi, '![]($1)');

  // Convert lists
  md = md.replace(/<li\b[^>]*>(.*?)<\/li>/gi, '- $1\n');
  md = md.replace(/<ul\b[^>]*>/gi, '\n');
  md = md.replace(/<\/ul>/gi, '\n');
  md = md.replace(/<ol\b[^>]*>/gi, '\n');
  md = md.replace(/<\/ol>/gi, '\n');

  // Convert formatting
  md = md.replace(/<strong\b[^>]*>(.*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b\b[^>]*>(.*?)<\/b>/gi, '**$1**');
  md = md.replace(/<em\b[^>]*>(.*?)<\/em>/gi, '*$1*');
  md = md.replace(/<i\b[^>]*>(.*?)<\/i>/gi, '*$1*');
  md = md.replace(/<code\b[^>]*>(.*?)<\/code>/gi, '`$1`');

  // Convert code blocks
  md = md.replace(/<pre\b[^>]*><code\b[^>]*>(.*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n');
  md = md.replace(/<pre\b[^>]*>(.*?)<\/pre>/gi, '\n```\n$1\n```\n');

  // Convert paragraphs and breaks
  md = md.replace(/<p\b[^>]*>/gi, '\n');
  md = md.replace(/<\/p>/gi, '\n');
  md = md.replace(/<br\s*\/?>/gi, '\n');
  md = md.replace(/<hr\s*\/?>/gi, '\n---\n');

  // Convert blockquotes
  md = md.replace(/<blockquote\b[^>]*>(.*?)<\/blockquote>/gi, (_, content) => {
    return '\n> ' + content.trim().replace(/\n/g, '\n> ') + '\n';
  });

  // Remove remaining HTML tags
  md = md.replace(/<[^>]+>/g, ' ');

  // Decode HTML entities
  md = md.replace(/&amp;/g, '&');
  md = md.replace(/&lt;/g, '<');
  md = md.replace(/&gt;/g, '>');
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, "'");
  md = md.replace(/&nbsp;/g, ' ');
  md = md.replace(/&mdash;/g, '—');
  md = md.replace(/&ndash;/g, '–');

  // Clean up whitespace
  md = md.replace(/[ \t]+/g, ' ');
  md = md.replace(/\n\s+\n/g, '\n\n');
  md = md.replace(/\n{3,}/g, '\n\n');

  return md.trim();
}

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

async function fetchWithRetry(
  url: string,
  attempt: number = 1,
): Promise<Response> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CortexPrism/1.0; +https://cortexprism.ai)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      redirect: 'follow',
    });

    clearTimeout(timer);
    return res;
  } catch (err) {
    if (attempt < RETRY_ATTEMPTS) {
      await sleep(RETRY_DELAY_MS * attempt);
      return fetchWithRetry(url, attempt + 1);
    }
    throw err;
  }
}

export const webFetchEnhancedTool: Tool = {
  definition: {
    name: 'web_fetch_enhanced',
    description:
      'Enhanced web page fetcher with markdown conversion, better content extraction, and automatic retry. Supports text, markdown, and HTML output formats. Includes smart content cleaning and entity decoding.',
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
        description: `Maximum characters to return (default: ${MAX_CONTENT_LENGTH})`,
        required: false,
      },
      {
        name: 'format',
        type: 'string',
        description: 'Output format: "text" (cleaned), "markdown" (converted), or "html" (raw)',
        required: false,
        enum: ['text', 'markdown', 'html'],
      },
    ],
  },

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();
    const url = String(args.url ?? '').trim();
    const maxLength = typeof args.maxLength === 'number' ? args.maxLength : MAX_CONTENT_LENGTH;
    const format = (args.format as 'text' | 'markdown' | 'html') ?? 'markdown';

    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      return {
        toolName: 'web_fetch_enhanced',
        success: false,
        output: '',
        error: 'URL must start with http:// or https://',
        errorInfo: {
          code: 'INVALID_URL',
          message: 'URL must be a valid HTTP or HTTPS URL',
          retryable: false,
        },
        durationMs: Date.now() - start,
      };
    }

    try {
      const res = await fetchWithRetry(url);

      if (!res.ok) {
        return {
          toolName: 'web_fetch_enhanced',
          success: false,
          output: '',
          error: `HTTP ${res.status} ${res.statusText}`,
          errorInfo: {
            code: 'HTTP_ERROR',
            message: `Server returned ${res.status} ${res.statusText}`,
            retryable: res.status >= 500 && res.status < 600,
            suggestedAction: res.status === 404
              ? 'URL not found. Check the URL and try again.'
              : res.status === 403
              ? 'Access forbidden. The site may require authentication or block automated access.'
              : 'Retry or check the URL.',
          },
          durationMs: Date.now() - start,
        };
      }

      const contentType = res.headers.get('content-type') ?? '';
      const isText = contentType.includes('text/') ||
        contentType.includes('json') ||
        contentType.includes('xml') ||
        contentType.includes('javascript') ||
        contentType.includes('application/xhtml');

      if (!isText) {
        return {
          toolName: 'web_fetch_enhanced',
          success: false,
          output: '',
          error: `Cannot fetch binary content type: ${contentType}`,
          errorInfo: {
            code: 'UNSUPPORTED_CONTENT_TYPE',
            message: `Content type ${contentType} is not supported`,
            retryable: false,
            suggestedAction: 'Use a different tool for binary content (images, PDFs, etc.)',
          },
          durationMs: Date.now() - start,
        };
      }

      const rawText = await res.text();
      let processed: string;

      if (format === 'html') {
        processed = rawText;
      } else if (format === 'markdown') {
        processed = htmlToMarkdown(rawText);
      } else {
        processed = stripHtml(rawText);
      }

      const finalUrl = res.url !== url ? res.url : url;
      const truncated = processed.length > maxLength;
      const output = truncated
        ? processed.slice(0, maxLength) +
          `\n\n[... Content truncated at ${maxLength} chars. Total: ${processed.length} chars]`
        : processed;

      const metadata = [
        `**URL:** ${finalUrl}`,
        `**Content-Type:** ${contentType}`,
        `**Format:** ${format}`,
        truncated ? `**Truncated:** Yes (${processed.length} → ${maxLength} chars)` : '',
        '',
      ].filter(Boolean).join('\n');

      return {
        toolName: 'web_fetch_enhanced',
        success: true,
        output: `${metadata}\n${output}`,
        durationMs: Date.now() - start,
        truncated,
        outputLength: output.length,
      };
    } catch (err) {
      const error = err as Error;
      return {
        toolName: 'web_fetch_enhanced',
        success: false,
        output: '',
        error: error.message || 'Network error',
        errorInfo: {
          code: error.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
          message: error.message,
          retryable: true,
          suggestedAction: error.name === 'AbortError'
            ? 'Request timed out after 30 seconds. The server may be slow or unresponsive.'
            : 'Network error occurred. Check connectivity and try again.',
        },
        durationMs: Date.now() - start,
      };
    }
  },
};

export default webFetchEnhancedTool;
