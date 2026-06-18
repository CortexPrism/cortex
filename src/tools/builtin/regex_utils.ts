/**
 * Regex Utilities Tool
 *
 * Pattern matching and text replacement using regular expressions.
 * Supports matching, substitution, and text extraction.
 */

import type { Tool, ToolCallResult, ToolContext } from '../types.ts';

export const regexUtilsTool: Tool = {
  definition: {
    name: 'regex_utils',
    description:
      'Regular expression utilities for pattern matching, substitution, and text extraction. Supports flags (g, i, m, s) and capture groups.',
    params: [
      {
        name: 'text',
        type: 'string',
        description: 'Text to process',
        required: true,
      },
      {
        name: 'operation',
        type: 'string',
        description: 'Operation: match, replace, test, split, exec',
        required: true,
        enum: ['match', 'replace', 'test', 'split', 'exec'],
      },
      {
        name: 'pattern',
        type: 'string',
        description: 'Regular expression pattern (without slashes)',
        required: true,
      },
      {
        name: 'replacement',
        type: 'string',
        description: 'Replacement string for replace operation (supports $1, $2, etc. for groups)',
        required: false,
      },
      {
        name: 'flags',
        type: 'string',
        description: 'Regex flags: g (global), i (case-insensitive), m (multiline), s (dotall)',
        required: false,
      },
    ],
    capabilities: [],
  },

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();

    try {
      // Validate inputs
      const text = String(args.text ?? '');
      const operation = String(args.operation ?? '').toLowerCase();
      const pattern = String(args.pattern ?? '').trim();

      if (!pattern) {
        return {
          toolName: 'regex_utils',
          success: false,
          output: '',
          error: 'pattern parameter is required',
          durationMs: Date.now() - start,
        };
      }

      if (!['match', 'replace', 'test', 'split', 'exec'].includes(operation)) {
        return {
          toolName: 'regex_utils',
          success: false,
          output: '',
          error: 'operation must be one of: match, replace, test, split, exec',
          durationMs: Date.now() - start,
        };
      }

      const flags = String(args.flags ?? '');

      // Create regex
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, flags);
      } catch (e) {
        return {
          toolName: 'regex_utils',
          success: false,
          output: '',
          error: `Invalid regex pattern: ${e instanceof Error ? e.message : String(e)}`,
          durationMs: Date.now() - start,
        };
      }

      let result: unknown;

      if (operation === 'match') {
        result = text.match(regex);
      } else if (operation === 'test') {
        result = regex.test(text);
      } else if (operation === 'replace') {
        const replacement = String(args.replacement ?? '');
        result = text.replace(regex, replacement);
      } else if (operation === 'split') {
        result = text.split(regex);
      } else if (operation === 'exec') {
        const matches: unknown[] = [];
        let match: RegExpExecArray | null;
        // Reset regex if global flag not set
        if (!regex.global) {
          match = regex.exec(text);
          if (match) {
            matches.push({
              match: match[0],
              groups: match.slice(1),
              index: match.index,
            });
          }
        } else {
          while ((match = regex.exec(text)) !== null) {
            matches.push({
              match: match[0],
              groups: match.slice(1),
              index: match.index,
            });
          }
        }
        result = matches.length > 0 ? matches : null;
      }

      const output = JSON.stringify(result, null, 2);

      return {
        toolName: 'regex_utils',
        success: true,
        output,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolName: 'regex_utils',
        success: false,
        output: '',
        error: `Regex operation failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
      };
    }
  },
};

export default regexUtilsTool;
