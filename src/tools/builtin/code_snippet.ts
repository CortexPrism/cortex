/**
 * Code Snippet Tool
 *
 * Extract code snippets from text, format, and syntax-highlight.
 */

import type { Tool, ToolCallResult, ToolContext } from '../types.ts';

/**
 * Extract code blocks from markdown text
 */
function extractCodeBlocks(text: string): Array<{ language: string; code: string }> {
  const codeBlocks: Array<{ language: string; code: string }> = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;

  let match;
  while ((match = regex.exec(text)) !== null) {
    const language = match[1] || 'text';
    const code = match[2].trim();
    codeBlocks.push({ language, code });
  }

  return codeBlocks;
}

/**
 * Format code with syntax highlighting indicators
 */
function formatCode(
  code: string,
  language: string,
  withLineNumbers: boolean,
): string {
  let formatted = code;

  if (withLineNumbers) {
    const lines = code.split('\n');
    formatted = lines
      .map((line, i) => `${String(i + 1).padStart(3, ' ')} | ${line}`)
      .join('\n');
  }

  // Add language indicator
  return `\`\`\`${language}\n${formatted}\n\`\`\``;
}

export const codeSnippetTool: Tool = {
  definition: {
    name: 'code_snippet',
    description:
      'Extract, format, and manage code snippets. Supports markdown code blocks, syntax highlighting, and line numbering.',
    params: [
      {
        name: 'text',
        type: 'string',
        description: 'Text containing code snippets',
        required: true,
      },
      {
        name: 'operation',
        type: 'string',
        description: 'Operation: extract, format, validate, count',
        required: true,
        enum: ['extract', 'format', 'validate', 'count'],
      },
      {
        name: 'language',
        type: 'string',
        description: 'Programming language for formatting (e.g., "python", "javascript")',
        required: false,
      },
      {
        name: 'lineNumbers',
        type: 'boolean',
        description: 'Add line numbers to formatted code (default: false)',
        required: false,
      },
      {
        name: 'index',
        type: 'number',
        description: 'Index of snippet to extract/format (0-based)',
        required: false,
      },
    ],
    capabilities: [],
  },

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();

    try {
      const text = String(args.text ?? '');
      const operation = String(args.operation ?? '').toLowerCase();

      if (!['extract', 'format', 'validate', 'count'].includes(operation)) {
        return {
          toolName: 'code_snippet',
          success: false,
          output: '',
          error: 'operation must be one of: extract, format, validate, count',
          durationMs: Date.now() - start,
        };
      }

      const codeBlocks = extractCodeBlocks(text);

      if (operation === 'count') {
        return {
          toolName: 'code_snippet',
          success: true,
          output: JSON.stringify({
            count: codeBlocks.length,
            languages: codeBlocks.map((b) => b.language),
          }),
          durationMs: Date.now() - start,
        };
      }

      if (operation === 'extract') {
        const index = (args.index as number) ?? 0;

        if (index < 0 || index >= codeBlocks.length) {
          return {
            toolName: 'code_snippet',
            success: false,
            output: '',
            error: `Invalid index: ${index} (total snippets: ${codeBlocks.length})`,
            durationMs: Date.now() - start,
          };
        }

        const block = codeBlocks[index];
        return {
          toolName: 'code_snippet',
          success: true,
          output: JSON.stringify(block, null, 2),
          durationMs: Date.now() - start,
        };
      }

      if (operation === 'format') {
        const index = (args.index as number) ?? 0;
        const language = (args.language as string) ?? 'text';
        const lineNumbers = (args.lineNumbers as boolean) ?? false;

        if (index < 0 || index >= codeBlocks.length) {
          return {
            toolName: 'code_snippet',
            success: false,
            output: '',
            error: `Invalid index: ${index}`,
            durationMs: Date.now() - start,
          };
        }

        const block = codeBlocks[index];
        const formatted = formatCode(block.code, language, lineNumbers);

        return {
          toolName: 'code_snippet',
          success: true,
          output: formatted,
          durationMs: Date.now() - start,
        };
      }

      if (operation === 'validate') {
        // Validate code blocks are properly closed
        const unclosed = (text.match(/```/g) || []).length % 2 !== 0;

        return {
          toolName: 'code_snippet',
          success: true,
          output: JSON.stringify({
            valid: !unclosed,
            snippetCount: codeBlocks.length,
            message: unclosed ? 'Unclosed code blocks detected' : 'All code blocks properly closed',
          }),
          durationMs: Date.now() - start,
        };
      }

      return {
        toolName: 'code_snippet',
        success: false,
        output: '',
        error: 'Unknown operation',
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolName: 'code_snippet',
        success: false,
        output: '',
        error: `Code snippet operation failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        durationMs: Date.now() - start,
      };
    }
  },
};

export default codeSnippetTool;
