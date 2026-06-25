import { extname } from '@std/path';
import type { AgentWorkspaceLike, Tool, ToolCallResult, ToolContext } from '../types.ts';
import { ensureAgentWorkspace, resolveWorkspacePath } from '../../workspace/paths.ts';

const MAX_BYTES = 64 * 1024;
const LARGE_FILE_THRESHOLD = 1024 * 1024; // 1MB

const PDF_EXT = /\.pdf$/i;

// Language detection by extension
const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.scala': 'scala',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'zsh',
  '.fish': 'fish',
  '.sql': 'sql',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.graphql': 'graphql',
  '.proto': 'protobuf',
  '.dockerfile': 'dockerfile',
  '.Dockerfile': 'dockerfile',
};

// Binary file extensions (won't try to read as text)
const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.ico',
  '.webp',
  '.svg',
  '.mp3',
  '.mp4',
  '.avi',
  '.mov',
  '.mkv',
  '.flv',
  '.wmv',
  '.zip',
  '.tar',
  '.gz',
  '.bz2',
  '.7z',
  '.rar',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.wasm',
  '.class',
  '.jar',
  '.db',
  '.sqlite',
  '.sqlite3',
]);

function detectLanguage(filePath: string): string | null {
  const ext = extname(filePath).toLowerCase();
  return LANGUAGE_MAP[ext] ?? null;
}

function isBinaryExtension(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

function isBinaryContent(buffer: Uint8Array, sampleSize = 512): boolean {
  const sample = buffer.slice(0, sampleSize);
  let nullBytes = 0;
  let controlChars = 0;

  for (let i = 0; i < sample.length; i++) {
    const byte = sample[i];
    if (byte === 0) nullBytes++;
    if (byte < 9 || (byte > 13 && byte < 32 && byte !== 27)) controlChars++;
  }

  // If >1% are null bytes or >10% are control chars, it's binary
  return (nullBytes / sample.length > 0.01) || (controlChars / sample.length > 0.1);
}

async function tryReadPdf(filePath: string, ws: AgentWorkspaceLike | undefined, workspace: 'agent' | 'global'): Promise<string | null> {
  try {
    const { extractPdfText } = await import('../../utils/pdf.ts');
    const data = ws && workspace === 'agent' ? await ws.readFileRaw(filePath) : await Deno.readFile(filePath);
    return await extractPdfText(data);
  } catch {
    return null;
  }
}

export const fileReadEnhancedTool: Tool = {
  definition: {
    name: 'file_read_enhanced',
    description:
      'Enhanced file reader with syntax language hints, better binary detection, and large file handling. Automatically detects file type and suggests appropriate syntax highlighting. Warns about binary files and large files.',
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
      {
        name: 'force_read',
        type: 'boolean',
        description: 'Force reading even if file appears to be binary (default: false)',
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
    const forceRead = args.force_read === true;

    let filePath: string;
    try {
      await ensureAgentWorkspace(context.agentId);
      filePath = resolveWorkspacePath(context.agentId, rawPath, workspace);
    } catch {
      return result(false, '', `Path "${rawPath}" is outside the allowed workspace`, start);
    }

    try {
      const ws = context.agentWorkspace;
      const s = ws && workspace === 'agent' ? await ws.stat(filePath) : await Deno.stat(filePath);

      if (!s.isFile) {
        return result(false, '', `Not a file: ${filePath}`, start);
      }

      const fileSize = s.size ?? 0;
      const language = detectLanguage(filePath);

      // Handle PDFs
      if (PDF_EXT.test(filePath)) {
        const pdfText = await tryReadPdf(filePath, ws, workspace);
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
          const header = `// ${filePath}  (PDF, ${pdfText.length} chars total, ${
            truncated ? 'output truncated' : 'showing all'
          })`;
          return result(true, `${header}\n${numbered}`, undefined, start);
        }
        return result(
          false,
          '',
          `Could not extract text from PDF: ${filePath}. The file may be encrypted, scanned, or contain only images.`,
          start,
        );
      }

      // Binary file check
      if (!forceRead && isBinaryExtension(filePath)) {
        return result(
          false,
          '',
          `Binary file detected by extension: ${filePath}. Use force_read=true to attempt reading as text.`,
          start,
        );
      }

      // Large file warning
      if (fileSize > LARGE_FILE_THRESHOLD) {
        const sizeMB = (fileSize / (1024 * 1024)).toFixed(2);
        return {
          toolName: 'file_read_enhanced',
          success: false,
          output: '',
          error:
            `Large file detected: ${sizeMB} MB. Reading partial content only. Use offset and limit parameters to read specific sections.`,
          errorInfo: {
            code: 'FILE_TOO_LARGE',
            message: `File is ${sizeMB} MB, which may be slow to read`,
            retryable: true,
            suggestedAction:
              'Use offset and limit parameters to read the file in chunks, or use file_search to find specific content.',
            context: { fileSizeBytes: fileSize, fileSizeMB: sizeMB },
          },
          durationMs: Date.now() - start,
        };
      }

      const raw = ws && workspace === 'agent' ? await ws.readFileRaw(filePath) : await Deno.readFile(filePath);

      // Binary content check (after reading first chunk)
      if (!forceRead && isBinaryContent(raw)) {
        return result(
          false,
          '',
          `Binary content detected: ${filePath}. This file contains non-text data. Use force_read=true to attempt reading anyway.`,
          start,
        );
      }

      const slice = raw.slice(0, MAX_BYTES);
      const text = new TextDecoder('utf-8', { fatal: false }).decode(slice);
      const truncated = raw.byteLength > MAX_BYTES;

      let lines = text.split('\n');
      const totalLines = lines.length;

      if (offset > 1 || limit !== undefined) {
        lines = lines.slice(offset - 1, limit !== undefined ? offset - 1 + limit : undefined);
      }

      const numbered = lines
        .map((l, i) => `${String(offset + i).padStart(4)} │ ${l}`)
        .join('\n');

      const metadata: string[] = [
        `// ${filePath}`,
        `// Lines: ${totalLines}, Size: ${fileSize} bytes`,
      ];

      if (language) {
        metadata.push(`// Language: ${language}`);
      }

      if (truncated) {
        metadata.push(`// [Truncated at 64KB — use offset/limit for more]`);
      }

      const header = metadata.join('\n');
      const output = language
        ? `${header}\n\`\`\`${language}\n${numbered}\n\`\`\``
        : `${header}\n${numbered}`;

      return result(true, output, undefined, start);
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
    toolName: 'file_read_enhanced',
    success,
    output,
    error,
    durationMs: Date.now() - startMs,
  };
}

export default fileReadEnhancedTool;
