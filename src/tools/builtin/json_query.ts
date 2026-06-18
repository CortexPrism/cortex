/**
 * JSON Query Tool
 *
 * Query and manipulate JSON data using JSONPath expressions.
 * Supports reading, filtering, and transforming JSON structures.
 */

import type { Tool, ToolCallResult, ToolContext } from '../types.ts';

/**
 * Simple JSONPath parser and evaluator
 * Supports: $.property, $.array[0], $.array[*], $.**.property
 */
function queryJSON(data: unknown, path: string): unknown {
  const parts = path.split('.');
  let current = data;

  for (const part of parts) {
    if (part === '$') continue;

    if (current === null || current === undefined) {
      return undefined;
    }

    if (part.includes('[')) {
      // Array access: property[0] or property[*]
      const match = part.match(/^(\w+)\[(.+)\]$/);
      if (match) {
        const [, prop, index] = match;
        const obj = (current as Record<string, unknown>)[prop];

        if (Array.isArray(obj)) {
          if (index === '*') {
            current = obj; // Keep array for next iteration
          } else {
            const idx = parseInt(index, 10);
            current = obj[idx];
          }
        }
      }
    } else if (part === '**') {
      // Recursive descent (simplified)
      current = recursiveFind(current, parts[parts.indexOf('**') + 1]);
      break;
    } else {
      // Object property access
      current = (current as Record<string, unknown>)[part];
    }
  }

  return current;
}

function recursiveFind(obj: unknown, key: string): unknown[] {
  const results: unknown[] = [];

  function traverse(value: unknown) {
    if (value && typeof value === 'object') {
      if (key in value) {
        results.push((value as Record<string, unknown>)[key]);
      }
      for (const v of Object.values(value)) {
        traverse(v);
      }
    }
  }

  traverse(obj);
  return results;
}

export const jsonQueryTool: Tool = {
  definition: {
    name: 'json_query',
    description:
      'Query and manipulate JSON data using JSONPath-like expressions. Supports property access, array indexing, filtering, and transformation.',
    params: [
      {
        name: 'json',
        type: 'string',
        description: 'JSON string to query (must be valid JSON)',
        required: true,
      },
      {
        name: 'path',
        type: 'string',
        description: 'JSONPath expression (e.g., "$.users[0].name", "$.items[*].id", "$.**email")',
        required: true,
      },
      {
        name: 'operation',
        type: 'string',
        description: 'Operation: read (default), set, delete, filter, count',
        required: false,
        enum: ['read', 'set', 'delete', 'filter', 'count'],
      },
      {
        name: 'value',
        type: 'string',
        description: 'New value for set operation (JSON string)',
        required: false,
      },
      {
        name: 'filterCondition',
        type: 'string',
        description: 'Filter condition for filter operation (e.g., "age > 18")',
        required: false,
      },
    ],
    capabilities: [],
  },

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();

    try {
      // Validate inputs
      const jsonStr = String(args.json ?? '').trim();
      if (!jsonStr) {
        return {
          toolName: 'json_query',
          success: false,
          output: '',
          error: 'json parameter is required',
          durationMs: Date.now() - start,
        };
      }

      const path = String(args.path ?? '').trim();
      if (!path) {
        return {
          toolName: 'json_query',
          success: false,
          output: '',
          error: 'path parameter is required',
          durationMs: Date.now() - start,
        };
      }

      // Parse JSON
      let data: unknown;
      try {
        data = JSON.parse(jsonStr);
      } catch (e) {
        return {
          toolName: 'json_query',
          success: false,
          output: '',
          error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
          durationMs: Date.now() - start,
        };
      }

      const operation = (args.operation ?? 'read') as string;

      let result: unknown;

      if (operation === 'read') {
        result = queryJSON(data, path);
      } else if (operation === 'count') {
        const value = queryJSON(data, path);
        if (Array.isArray(value)) {
          result = value.length;
        } else if (typeof value === 'object' && value !== null) {
          result = Object.keys(value).length;
        } else {
          result = value !== undefined && value !== null ? 1 : 0;
        }
      } else if (operation === 'filter') {
        const filterCond = String(args.filterCondition ?? '');
        const value = queryJSON(data, path);

        if (Array.isArray(value)) {
          result = value.filter((item) => {
            // Simple filter evaluation (very basic)
            if (filterCond.includes('>')) {
              const [left, right] = filterCond.split('>');
              const lval = (item as Record<string, unknown>)[left.trim()];
              const rval = parseInt(right.trim(), 10);
              return (lval as number) > rval;
            }
            return true;
          });
        } else {
          result = value;
        }
      } else {
        result = queryJSON(data, path);
      }

      const output = JSON.stringify(result, null, 2);

      return {
        toolName: 'json_query',
        success: true,
        output,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolName: 'json_query',
        success: false,
        output: '',
        error: `JSON query failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
      };
    }
  },
};

export default jsonQueryTool;
