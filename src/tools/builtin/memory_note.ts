import type { Tool, ToolCallResult, ToolContext } from '../types.ts';
import { appendToMemoryFile } from '../../agent/soul.ts';
import { writeSemantic } from '../../memory/store.ts';
import { autoCategorize } from '../../memory/heuristics.ts';

export const memoryNoteTool: Tool = {
  definition: {
    name: 'memory_note',
    description:
      'Persist an important fact, user preference, or instruction to long-term memory. ' +
      'Writes to both the persistent MEMORY.md file (survives sessions) and the semantic ' +
      'memory database (searchable). Use this whenever the user states a preference, ' +
      'corrects you, gives you a name to use, or shares a fact you should remember long-term.',
    params: [
      {
        name: 'content',
        type: 'string',
        description: 'The fact or preference to remember, written as a clear declarative sentence.',
        required: true,
      },
      {
        name: 'category',
        type: 'string',
        description:
          'Category hint: preference | identity | project | decision | correction | general',
        required: false,
      },
    ],
    capabilities: ['db:write', 'fs:write'],
  },

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolCallResult> {
    const content = String(args.content ?? '').trim();
    if (!content) {
      return {
        toolName: 'memory_note',
        success: false,
        output: '',
        error: 'content is required',
        durationMs: 0,
      };
    }

    const start = Date.now();
    const categoryHint = String(args.category ?? '').trim();
    const { category, tags } = autoCategorize(content);
    const effectiveCategory = categoryHint || category;

    try {
      await Promise.all([
        appendToMemoryFile(`- [${effectiveCategory}] ${content}`),
        writeSemantic({
          content,
          category: effectiveCategory,
          tags: categoryHint ? [categoryHint, ...tags].slice(0, 5) : tags,
          importance: 0.85,
        }),
      ]);

      return {
        toolName: 'memory_note',
        success: true,
        output: `Remembered: "${content}"`,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        toolName: 'memory_note',
        success: false,
        output: '',
        error: (err as Error).message,
        durationMs: Date.now() - start,
      };
    }
  },
};
