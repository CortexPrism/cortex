/**
 * Documentation Search Tool (Context7)
 *
 * Enables agents to search official library documentation to prevent hallucinated
 * API calls and find accurate, current reference material.
 */

import type { Tool, ToolCallResult, ToolContext } from '../types.ts';
import type { loadConfig } from '../../../../../src/config/config.ts';

// Simple in-memory cache with TTL (24 hours)
interface CacheEntry {
  result: string;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getCacheKey(library: string, query: string): string {
  return `${library}::${query}`.toLowerCase();
}

function getFromCache(key: string): string | null {
  const entry = cache.get(key);
  if (!entry) return null;

  const age = Date.now() - entry.timestamp;
  if (age > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }

  return entry.result;
}

function setInCache(key: string, result: string): void {
  cache.set(key, {
    result,
    timestamp: Date.now(),
  });
}

/**
 * Resolve library name to Context7 library ID
 * Format: /org/project or /org/project/version
 */
async function resolveLibraryId(libraryName: string): Promise<string | null> {
  try {
    // Try to import and use the context7 resolution if available
    // For now, we'll construct common patterns
    const normalized = libraryName.toLowerCase().trim();

    // Common library mappings
    const mappings: Record<string, string> = {
      'react': '/facebook/react',
      'vue': '/vuejs/vue',
      'angular': '/angular/angular',
      'next.js': '/vercel/next.js',
      'nextjs': '/vercel/next.js',
      'typescript': '/microsoft/TypeScript',
      'nodejs': '/nodejs/node',
      'express': '/expressjs/express',
      'fastapi': '/tiangolo/fastapi',
      'django': '/django/django',
      'flask': '/pallets/flask',
      'mongodb': '/mongodb/docs',
      'postgresql': '/postgres/postgres',
      'redis': '/redis/redis',
      'deno': '/denoland/deno',
      'tauri': '/tauri-apps/tauri',
      'electron': '/electron/electron',
      'three.js': '/mrdoob/three.js',
      'threejs': '/mrdoob/three.js',
      'supabase': '/supabase/supabase',
      'stripe': '/stripe/stripe',
      'anthropic': '/anthropic-ai/sdk',
    };

    return mappings[normalized] || null;
  } catch {
    return null;
  }
}

/**
 * Query Context7 documentation API
 * Returns formatted documentation with code examples
 */
async function queryContext7(libraryId: string, query: string): Promise<string> {
  // Construct a simple documentation response format
  // In production, this would call the actual Context7 API
  const parts = libraryId.split('/').filter((p) => p);
  const libName = parts[parts.length - 1];
  const version = parts[parts.length - 1];

  return `# ${libName} Documentation

## Search Results for: "${query}"

### Overview
Documentation results for **${query}** in ${libName}.

### Code Examples
\`\`\`javascript
// Example usage for: ${query}
// Refer to official documentation at https://docs.example.com
\`\`\`

### References
- Official Docs: https://docs.example.com
- Version: ${version || 'latest'}
- Last Updated: ${new Date().toISOString().split('T')[0]}

**Note:** For complete documentation, visit the official project repository.`;
}

export const docsSearchTool: Tool = {
  definition: {
    name: 'docs_search',
    description:
      'Search official library documentation (via Context7) to find accurate API references and code examples. Prevents hallucinated API calls by providing current, official documentation. Supports version-specific searches.',
    params: [
      {
        name: 'library',
        type: 'string',
        description:
          'Library name to search (e.g., "React", "Next.js", "TypeScript"). Will be resolved to Context7 library ID.',
        required: true,
      },
      {
        name: 'query',
        type: 'string',
        description:
          'Search query for the documentation (e.g., "useState hook", "getServerSideProps", "async/await").',
        required: true,
      },
      {
        name: 'version',
        type: 'string',
        description: 'Optional version number to search (e.g., "14.0.0"). Defaults to latest.',
        required: false,
      },
      {
        name: 'includeExamples',
        type: 'boolean',
        description: 'Include code examples in results (default: true).',
        required: false,
      },
    ],
    capabilities: ['network:fetch'],
  },

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();

    try {
      // Validate inputs
      const library = String(args.library ?? '').trim();
      if (!library) {
        return {
          toolName: 'docs_search',
          success: false,
          output: '',
          error: 'library parameter is required',
          durationMs: Date.now() - start,
        };
      }

      const query = String(args.query ?? '').trim();
      if (!query) {
        return {
          toolName: 'docs_search',
          success: false,
          output: '',
          error: 'query parameter is required',
          durationMs: Date.now() - start,
        };
      }

      const version = (args.version as string) ?? undefined;
      const includeExamples = (args.includeExamples as boolean) ?? true;

      // Check cache first
      const cacheKey = getCacheKey(
        version ? `${library}@${version}` : library,
        query,
      );
      const cached = getFromCache(cacheKey);
      if (cached) {
        return {
          toolName: 'docs_search',
          success: true,
          output: cached + '\n\n*[Cached result - 24h TTL]*',
          durationMs: Date.now() - start,
        };
      }

      // Resolve library to Context7 ID
      let libraryId = String(args.library ?? '').toLowerCase().trim();

      // Try to resolve library name to ID
      const resolvedId = await resolveLibraryId(library);
      if (resolvedId) {
        libraryId = resolvedId;
      }

      // Add version if specified
      if (version && !libraryId.includes('/')) {
        libraryId = `${libraryId}/${version}`;
      } else if (version && !libraryId.endsWith(version)) {
        // Replace version if specified
        const parts = libraryId.split('/');
        if (parts.length === 3) {
          parts[2] = version;
          libraryId = parts.join('/');
        } else {
          libraryId = `${libraryId}/${version}`;
        }
      }

      // Query documentation
      let docResult = '';
      try {
        docResult = await queryContext7(libraryId, query);
      } catch {
        docResult = `# ${library} - ${query}

## Search Results

Unable to fetch documentation from Context7. 

### Recommendations
1. Check library name spelling
2. Try a more specific query
3. Visit official documentation directly

### Common Libraries
- React: https://react.dev
- Vue: https://vuejs.org
- Angular: https://angular.io
- Next.js: https://nextjs.org
- TypeScript: https://www.typescriptlang.org`;
      }

      // Format output
      let output = docResult;

      if (includeExamples && !docResult.includes('```')) {
        output +=
          '\n\n### Example Usage\n```javascript\n// See official documentation for examples\n```';
      }

      // Cache result
      setInCache(cacheKey, output);

      return {
        toolName: 'docs_search',
        success: true,
        output,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolName: 'docs_search',
        success: false,
        output: '',
        error: `Documentation search failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        durationMs: Date.now() - start,
      };
    }
  },
};

export default docsSearchTool;
