/**
 * Environment Manager Tool
 *
 * Get and set environment variables safely with validation.
 */

import type { Tool, ToolCallResult, ToolContext } from '../types.ts';

// Whitelist of allowed environment variables (security)
const ALLOWED_ENV_VARS = new Set([
  'PATH',
  'HOME',
  'USER',
  'SHELL',
  'LANG',
  'LC_ALL',
  'NODE_ENV',
  'RUST_LOG',
  'DENO_DIR',
  'CORTEX_DATA_DIR',
  'CORTEX_CONFIG_DIR',
]);

export const envManagerTool: Tool = {
  definition: {
    name: 'env_manager',
    description:
      'Read and set environment variables safely. Supports reading public variables and setting whitelisted variables.',
    params: [
      {
        name: 'operation',
        type: 'string',
        description: 'Operation: get, set, list, has',
        required: true,
        enum: ['get', 'set', 'list', 'has'],
      },
      {
        name: 'key',
        type: 'string',
        description: 'Variable name (required for get, set, has)',
        required: false,
      },
      {
        name: 'value',
        type: 'string',
        description: 'Value to set (required for set operation)',
        required: false,
      },
    ],
    capabilities: [],
  },

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();

    try {
      const operation = String(args.operation ?? '').toLowerCase();

      if (!['get', 'set', 'list', 'has'].includes(operation)) {
        return {
          toolName: 'env_manager',
          success: false,
          output: '',
          error: 'operation must be one of: get, set, list, has',
          durationMs: Date.now() - start,
        };
      }

      if (operation === 'list') {
        // List all public environment variables
        const env = Deno.env.toObject();
        const publicVars: Record<string, string> = {};

        for (const [key, value] of Object.entries(env)) {
          // Skip sensitive prefixes
          if (
            !key.startsWith('CORTEX_VAULT') &&
            !key.includes('PASSWORD') &&
            !key.includes('SECRET') &&
            !key.includes('TOKEN') &&
            !key.includes('KEY')
          ) {
            publicVars[key] = value;
          }
        }

        return {
          toolName: 'env_manager',
          success: true,
          output: JSON.stringify(publicVars, null, 2),
          durationMs: Date.now() - start,
        };
      }

      const key = String(args.key ?? '').trim();

      if (!key) {
        return {
          toolName: 'env_manager',
          success: false,
          output: '',
          error: 'key parameter is required',
          durationMs: Date.now() - start,
        };
      }

      if (operation === 'get') {
        if (!ALLOWED_ENV_VARS.has(key)) {
          return {
            toolName: 'env_manager',
            success: false,
            output: '',
            error: `${key} is not in readable variables list`,
            durationMs: Date.now() - start,
          };
        }
        const value = Deno.env.get(key);
        return {
          toolName: 'env_manager',
          success: true,
          output: value !== undefined ? value : `${key} is not set`,
          durationMs: Date.now() - start,
        };
      }

      if (operation === 'has') {
        const has = Deno.env.has(key);
        return {
          toolName: 'env_manager',
          success: true,
          output: JSON.stringify({ key, exists: has }),
          durationMs: Date.now() - start,
        };
      }

      if (operation === 'set') {
        // Check if variable is whitelisted
        if (!ALLOWED_ENV_VARS.has(key)) {
          return {
            toolName: 'env_manager',
            success: false,
            output: '',
            error: `${key} is not in whitelist. Allowed: ${
              Array.from(ALLOWED_ENV_VARS).join(', ')
            }`,
            durationMs: Date.now() - start,
          };
        }

        const value = String(args.value ?? '');
        Deno.env.set(key, value);

        return {
          toolName: 'env_manager',
          success: true,
          output: JSON.stringify({
            key,
            value,
            message: `Set ${key}=${value}`,
          }),
          durationMs: Date.now() - start,
        };
      }

      return {
        toolName: 'env_manager',
        success: false,
        output: '',
        error: 'Invalid operation',
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolName: 'env_manager',
        success: false,
        output: '',
        error: `Environment operation failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        durationMs: Date.now() - start,
      };
    }
  },
};

export default envManagerTool;
