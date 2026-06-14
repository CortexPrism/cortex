import { join, resolve } from '@std/path';
import type { Tool, ToolCallResult, ToolContext } from '../types.ts';

const MAX_BYTES = 64 * 1024;

export const fileReadTool: Tool = {
  definition: {
    name: 'file_read',
    description: 'Read the contents of a file. Returns up to 64KB.',
    capabilities: ['fs:read'],
    params: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to the file (absolute or relative to working directory)',
        required: true,
      },
      {
        name: 'offset',
        type: 'number',
        description: 'Line offset to start reading from (1-indexed)',
        required: false,
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Maximum number of lines to return',
        required: false,
      },
    ],
  },

  async execute(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolCallResult> {
    const start = Date.now();
    const rawPath = String(args.path ?? '');
    const offset = typeof args.offset === 'number' ? Math.max(1, args.offset) : 1;
    const limit = typeof args.limit === 'number' ? args.limit : undefined;

    const filePath = rawPath.startsWith('/')
      ? rawPath
      : resolve(join(context.workingDir, rawPath));

    try {
      const stat = await Deno.stat(filePath);
      if (!stat.isFile) {
        return result(false, '', `Not a file: ${filePath}`, start);
      }

      const raw = await Deno.readFile(filePath);
      const slice = raw.slice(0, MAX_BYTES);
      const text = new TextDecoder().decode(slice);
      const truncated = raw.byteLength > MAX_BYTES;

      let lines = text.split('\n');
      const totalLines = lines.length;

      if (offset > 1 || limit !== undefined) {
        lines = lines.slice(offset - 1, limit !== undefined ? offset - 1 + limit : undefined);
      }

      const numbered = lines
        .map((l, i) => `${String(offset + i).padStart(4)} │ ${l}`)
        .join('\n');

      const header = `// ${filePath}  (${totalLines} lines${truncated ? ', truncated at 64KB' : ''})`;
      return result(true, `${header}\n${numbered}`, undefined, start);
    } catch (err) {
      return result(false, '', (err as Error).message, start);
    }
  },
};

function result(
  success: boolean,
  output: string,
  error: string | undefined,
  startMs: number,
): ToolCallResult {
  return {
    toolName: 'file_read',
    success,
    output,
    error,
    durationMs: Date.now() - startMs,
  };
}

export default fileReadTool;
