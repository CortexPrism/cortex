import { join, resolve } from '@std/path';
import type { Tool, ToolCallResult, ToolContext } from '../types.ts';
import { ensureAgentWorkspace, resolveWorkspacePath } from '../../workspace/paths.ts';

const MAX_BYTES = 64 * 1024;

const PDF_EXT = /\.pdf$/i;

async function tryReadPdf(filePath: string): Promise<string | null> {
  try {
    const { extractPdfText } = await import('../../utils/pdf.ts');
    const data = await Deno.readFile(filePath);
    return await extractPdfText(data);
  } catch {
    return null;
  }
}

export const fileReadTool: Tool = {
  definition: {
    name: 'file_read',
    description:
      'Read any file including PDFs (auto-extracts text). Returns up to 64KB with line numbers.',
    capabilities: ['fs:read'],
    params: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to the file (absolute or relative)',
        required: true,
      },
      {
        name: 'workspace',
        type: 'string',
        description: 'Target workspace: "agent" (default) or "global"',
        required: false,
        enum: ['agent', 'global'],
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
    const workspace = (args.workspace as 'agent' | 'global') ?? 'agent';
    const offset = typeof args.offset === 'number' ? Math.max(1, args.offset) : 1;
    const limit = typeof args.limit === 'number' ? args.limit : undefined;

    let filePath: string;
    try {
      await ensureAgentWorkspace(context.agentId);
      filePath = resolveWorkspacePath(context.agentId, rawPath, workspace);
    } catch {
      filePath = rawPath.startsWith('/') ? rawPath : resolve(join(context.workingDir, rawPath));
    }

    try {
      const stat = await Deno.stat(filePath);
      if (!stat.isFile) {
        return result(false, '', `Not a file: ${filePath}`, start);
      }

      if (PDF_EXT.test(filePath)) {
        const pdfText = await tryReadPdf(filePath);
        if (pdfText) {
          const maxLines = 150;
          const maxChars = 8000;
          let content = pdfText;
          if (content.length > maxChars) content = content.slice(0, maxChars);
          let lines = content.split('\n');
          if (lines.length > maxLines) lines = lines.slice(0, maxLines);
          const truncated = pdfText.length > maxChars || pdfText.split('\n').length > maxLines;
          if (offset > 1 || limit !== undefined) {
            lines = lines.slice(offset - 1, limit !== undefined ? offset - 1 + limit : undefined);
          }
          const numbered = lines
            .map((l, i) => `${String(offset + i).padStart(4)} │ ${l}`)
            .join('\n');
          const header =
            `// ${filePath}  (PDF, ${pdfText.length} chars total, showing first ${content.length} chars${
              truncated ? ', output truncated' : ''
            })`;
          return result(true, `${header}\n${numbered}`, undefined, start);
        }
        return result(
          false,
          '',
          `Could not extract text from PDF: ${filePath}. The file may be encrypted, scanned, or contain only images. If inline content was provided with the message, use that instead.`,
          start,
        );
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

      const header = `// ${filePath}  (${totalLines} lines${
        truncated ? ', truncated at 64KB' : ''
      })`;
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
