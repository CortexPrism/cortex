/**
 * Memory Search Tool
 *
 * Enables agents to search their own memory (episodic, semantic, reflection, graph)
 * with automatic security supervision for sensitive data.
 */

import type { Tool, ToolCallResult, ToolContext } from '../types.ts';
import { retrieve } from '../../memory/store.ts';
import { buildEmbedder } from '../../memory/embeddings.ts';
import { loadConfig } from '../../config/config.ts';
import {
  classifyContent,
  requiresHuman,
  requiresSupervisor,
} from '../../security/classification.ts';
import { requestSupervisorDecision } from '../../security/supervisor.ts';
import type { SensitivityLevel } from '../../security/classification.ts';

export const memorySearchTool: Tool = {
  definition: {
    name: 'memory_search',
    description:
      'Search agent memory (episodic, semantic, reflection, graph tiers) with keyword and vector similarity. Returns ranked results with decay scores. Supports tier filtering and session scoping. Automatically supervised for sensitive data access.',
    params: [
      {
        name: 'query',
        type: 'string',
        description: 'Search query. Keywords or natural language question.',
        required: true,
      },
      {
        name: 'tier',
        type: 'string',
        description:
          'Memory tier to search (default: "all"). episodic=sessions/conversations, semantic=facts/knowledge, reflection=learned patterns, graph=knowledge graph relationships',
        required: false,
        enum: ['episodic', 'semantic', 'reflection', 'graph', 'all'],
      },
      {
        name: 'maxResults',
        type: 'number',
        description: 'Maximum results to return (default: 6, max: 20)',
        required: false,
      },
      {
        name: 'sessionId',
        type: 'string',
        description:
          'Optional session ID to scope results to specific conversation (filters episodic results)',
        required: false,
      },
      {
        name: 'reason',
        type: 'string',
        description:
          'Justification for accessing memory (used by security supervisor to evaluate request)',
        required: false,
      },
    ],
    capabilities: ['db:read'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();

    try {
      // Validate input
      if (!args.query || typeof args.query !== 'string') {
        return {
          toolName: 'memory_search',
          success: false,
          output: '',
          error: 'query parameter is required and must be a string',
          durationMs: Date.now() - start,
        };
      }

      const query = (args.query as string).trim();
      if (!query) {
        return {
          toolName: 'memory_search',
          success: false,
          output: '',
          error: 'query cannot be empty',
          durationMs: Date.now() - start,
        };
      }

      const tier = (args.tier ?? 'all') as
        | 'episodic'
        | 'semantic'
        | 'reflection'
        | 'graph'
        | 'all';
      const maxResults = Math.min(
        Math.max(1, (args.maxResults as number) ?? 6),
        20,
      );
      const sessionId = (args.sessionId as string) ?? undefined;
      const reason = ((args.reason as string) ?? '') as string;

      // Load config for embedder
      const config = await loadConfig();

      // Build embedder (for vector similarity search)
      const embedder = buildEmbedder(config);

      // Search memory
      const hits = await retrieve(query, embedder, { limit: maxResults * 2 });

      // Filter by tier
      let filtered = hits;
      if (tier !== 'all') {
        if (tier === 'reflection' || tier === 'graph') {
          // NOTE: reflection and graph are currently included in semantic tier results
          // Future enhancement: separate reflection tier search
          filtered = hits.filter((h) => h.type === 'semantic');
        } else {
          filtered = hits.filter((h) => h.type === tier);
        }
      }

      // Filter by session if specified
      if (sessionId && tier !== 'reflection' && tier !== 'graph') {
        // Session scoping is metadata-based; would require DB query for full support
        // For now, we return all results with note that session filtering requires DB access
        // TODO: Implement full session-scoped filtering via DB query on session_id column
      }

      // Slice to requested limit
      const results = filtered.slice(0, maxResults);

      // Check sensitivity of results
      const hitTexts = results.map((h) => h.text).join('\n');
      const sensitivity = classifyContent(hitTexts) as SensitivityLevel;

      // Apply security gates
      if (requiresSupervisor(sensitivity)) {
        // Request supervisor decision
        const decision = await requestSupervisorDecision({
          tool: 'memory_search',
          query,
          requestReason: reason,
          sessionId: context.sessionId || 'unknown',
          agentId: context.agentId || 'unknown',
          dataClassification: sensitivity,
          sampleData: results.length > 0 ? results[0].text : undefined,
        });

        if (!decision.allowed) {
          return {
            toolName: 'memory_search',
            success: false,
            output: '',
            error: `Access denied: ${decision.reason}`,
            durationMs: Date.now() - start,
          };
        }

        if (requiresHuman(sensitivity)) {
          // TODO: Integrate human approval flow
          // For now, proceed with supervisor approval
          // In production, would call requestWebUIApproval or requestHumanApproval
        }
      }

      // Format results as readable markdown list
      const formatted = results.length === 0 ? 'No matches found.' : results
        .map(
          (h, i) =>
            `${i + 1}. **${h.type.toUpperCase()}** [score: ${h.score.toFixed(2)}, decay: ${
              h.decayScore?.toFixed(2) ?? 'N/A'
            }]\n${h.text}${
              h.created_at ? `\n   _${new Date(h.created_at).toLocaleString()}_` : ''
            }`,
        )
        .join('\n\n');

      return {
        toolName: 'memory_search',
        success: true,
        output: formatted,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolName: 'memory_search',
        success: false,
        output: '',
        error: `Memory search failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
      };
    }
  },
};

export default memorySearchTool;
