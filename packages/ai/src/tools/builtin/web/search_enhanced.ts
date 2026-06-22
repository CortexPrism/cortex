import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';
import { getCachedResult, setCachedResult } from './cache.ts';
import { webSearchTool } from '../web_search.ts';
import { braveSearchTool } from './brave_search.ts';
import { tavilySearchTool } from './tavily_search.ts';

const MAX_RESULTS = 8;
const RETRY_ATTEMPTS = 2;
const RETRY_DELAY_MS = 1000;

interface SearchProvider {
  name: string;
  tool: Tool;
  requiresAuth: boolean;
  checkAvailable: () => Promise<boolean>;
}

async function checkBraveAvailable(): Promise<boolean> {
  const envKey = Deno.env.get('BRAVE_SEARCH_API_KEY');
  if (envKey) return true;
  try {
    const { vaultGet } = await import('../../../security/vault.ts');
    const key = await vaultGet('brave_search_api_key');
    return !!key;
  } catch {
    return false;
  }
}

async function checkTavilyAvailable(): Promise<boolean> {
  const envKey = Deno.env.get('TAVILY_API_KEY');
  if (envKey) return true;
  try {
    const { vaultGet } = await import('../../../security/vault.ts');
    const key = await vaultGet('tavily_api_key');
    return !!key;
  } catch {
    return false;
  }
}

const PROVIDERS: SearchProvider[] = [
  {
    name: 'brave',
    tool: braveSearchTool,
    requiresAuth: true,
    checkAvailable: checkBraveAvailable,
  },
  {
    name: 'tavily',
    tool: tavilySearchTool,
    requiresAuth: true,
    checkAvailable: checkTavilyAvailable,
  },
  {
    name: 'duckduckgo',
    tool: webSearchTool,
    requiresAuth: false,
    checkAvailable: async () => true,
  },
];

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function trySearch(
  provider: SearchProvider,
  query: string,
  maxResults: number,
  context: ToolContext,
  attempt: number = 1,
): Promise<ToolCallResult | null> {
  try {
    const result = await provider.tool.execute(
      { query, max_results: maxResults },
      context,
    );

    if (result.success && result.output.length > 100) {
      return result;
    }

    // Retry on failure if attempts remain
    if (!result.success && attempt < RETRY_ATTEMPTS) {
      await sleep(RETRY_DELAY_MS * attempt);
      return await trySearch(provider, query, maxResults, context, attempt + 1);
    }

    return result.success ? result : null;
  } catch {
    // Retry on exception if attempts remain
    if (attempt < RETRY_ATTEMPTS) {
      await sleep(RETRY_DELAY_MS * attempt);
      return await trySearch(provider, query, maxResults, context, attempt + 1);
    }
    return null;
  }
}

export const webSearchEnhancedTool: Tool = {
  definition: {
    name: 'web_search_enhanced',
    description:
      'Enhanced web search with intelligent provider selection, caching, and automatic fallback. Tries Brave Search (if API key available), then Tavily AI (if API key available), then DuckDuckGo (always available). Results are cached for 1 hour. Includes automatic retry on failure.',
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
      {
        name: 'use_cache',
        type: 'boolean',
        description: 'Use cached results if available (default true)',
        required: false,
      },
      {
        name: 'prefer_provider',
        type: 'string',
        description: 'Preferred provider: "brave", "tavily", or "duckduckgo"',
        required: false,
        enum: ['brave', 'tavily', 'duckduckgo'],
      },
    ],
  },

  async execute(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolCallResult> {
    const start = Date.now();
    const query = String(args.query ?? '').trim();
    const maxResults = typeof args.max_results === 'number' ? args.max_results : MAX_RESULTS;
    const useCache = args.use_cache !== false;
    const preferProvider = args.prefer_provider as string | undefined;

    if (!query) {
      return mkResult(false, '', 'No query provided', start, 'none');
    }

    // Check cache first
    if (useCache) {
      for (const provider of PROVIDERS) {
        const cached = await getCachedResult(query, provider.name);
        if (cached) {
          return mkResult(
            true,
            `${cached}\n\n_[Cached result from ${provider.name}]_`,
            undefined,
            start,
            provider.name,
          );
        }
      }
    }

    // Build provider order based on preference and availability
    let orderedProviders = [...PROVIDERS];
    if (preferProvider) {
      const preferred = PROVIDERS.find((p) => p.name === preferProvider);
      if (preferred) {
        orderedProviders = [
          preferred,
          ...PROVIDERS.filter((p) => p.name !== preferProvider),
        ];
      }
    }

    // Filter to available providers
    const availableProviders: SearchProvider[] = [];
    for (const provider of orderedProviders) {
      if (await provider.checkAvailable()) {
        availableProviders.push(provider);
      }
    }

    if (availableProviders.length === 0) {
      return mkResult(
        false,
        '',
        'No search providers available. Configure BRAVE_SEARCH_API_KEY or TAVILY_API_KEY, or ensure network connectivity for DuckDuckGo.',
        start,
        'none',
      );
    }

    // Try each provider in order
    const errors: string[] = [];
    for (const provider of availableProviders) {
      const result = await trySearch(provider, query, maxResults, context);

      if (result && result.success) {
        // Cache successful result
        if (useCache) {
          await setCachedResult(query, provider.name, result.output);
        }

        return {
          ...result,
          toolName: 'web_search_enhanced',
          output: `${result.output}\n\n_[Source: ${provider.name}]_`,
          durationMs: Date.now() - start,
        };
      }

      if (result?.error) {
        errors.push(`${provider.name}: ${result.error}`);
      }
    }

    // All providers failed
    return mkResult(
      false,
      '',
      `All search providers failed:\n${errors.join('\n')}`,
      start,
      'none',
    );
  },
};

function mkResult(
  success: boolean,
  output: string,
  error: string | undefined,
  startMs: number,
  provider: string,
): ToolCallResult {
  return {
    toolName: 'web_search_enhanced',
    success,
    output,
    error,
    durationMs: Date.now() - startMs,
    errorInfo: error
      ? {
        code: 'SEARCH_FAILED',
        message: error,
        retryable: true,
        suggestedAction:
          `Provider ${provider} failed. Configure additional search API keys for redundancy.`,
        context: { provider },
      }
      : undefined,
  };
}

export default webSearchEnhancedTool;
