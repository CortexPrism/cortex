import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';
import {
  ensureAgentWorkspace,
  resolveWorkspacePath,
} from '../../../../../../src/workspace/paths.ts';

export const fileSearchTool: Tool = {
  definition: {
    name: 'file_search',
    description: 'Search for a regex pattern across files in the workspace.',
    capabilities: ['fs:search', 'fs:read'],
    params: [
      {
        name: 'pattern',
        type: 'string',
        description: 'Regular expression pattern to search for',
        required: true,
      },
      {
        name: 'path',
        type: 'string',
        description: 'Directory to search in (default: workspace root)',
        required: false,
      },
      {
        name: 'workspace',
        type: 'string',
        description: 'Target workspace: "agent" (default) or "global"',
        required: false,
        enum: ['agent', 'global'],
      },
      {
        name: 'include',
        type: 'string',
        description: 'Glob pattern to filter files (e.g. "*.ts")',
        required: false,
      },
      {
        name: 'maxResults',
        type: 'number',
        description: 'Maximum number of matches to return (default: 50)',
        required: false,
      },
    ],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();
    const patternStr = String(args.pattern ?? '');
    const rawPath = String(args.path ?? '');
    const workspace = (args.workspace as 'agent' | 'global') ?? 'agent';
    const include = args.include ? String(args.include) : undefined;
    const maxResults = typeof args.maxResults === 'number' ? args.maxResults : 50;

    try {
      await ensureAgentWorkspace(context.agentId);
      const searchDir = rawPath
        ? resolveWorkspacePath(context.agentId, rawPath, workspace)
        : workspace === 'agent'
        ? (await ensureAgentWorkspace(context.agentId))
        : Deno.cwd();

      const regex = new RegExp(patternStr, 'g');
      const results: string[] = [];
      let fileCount = 0;

      await searchInDir(searchDir, regex, include, results, maxResults, 0);
      fileCount = results.length;

      const output = results.length === 0 ? 'No matches found.' : results.join('\n') +
        (fileCount >= maxResults ? `\n... (max ${maxResults} results, truncated)` : '');

      return {
        toolName: 'file_search',
        success: true,
        output,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        toolName: 'file_search',
        success: false,
        output: '',
        error: (err as Error).message,
        durationMs: Date.now() - start,
      };
    }
  },
};

async function searchInDir(
  dirPath: string,
  regex: RegExp,
  includeGlob: string | undefined,
  results: string[],
  maxResults: number,
  depth: number,
): Promise<void> {
  if (depth > 20 || results.length >= maxResults) return;

  const dir = Deno.readDir(dirPath);
  for await (const entry of dir) {
    if (results.length >= maxResults) return;
    const entryPath = `${dirPath}/${entry.name}`;

    if (entry.isDirectory && !entry.name.startsWith('.')) {
      await searchInDir(entryPath, regex, includeGlob, results, maxResults, depth + 1);
    } else if (entry.isFile) {
      if (includeGlob) {
        const globRe = new RegExp('^' + includeGlob.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
        if (!globRe.test(entry.name)) continue;
      }

      try {
        const content = await Deno.readTextFile(entryPath);
        regex.lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(content)) !== null && results.length < maxResults) {
          const lineNum = content.slice(0, match.index).split('\n').length;
          const lineStart = content.lastIndexOf('\n', match.index) + 1;
          const lineEnd = content.indexOf('\n', match.index);
          const lineContent = content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
          results.push(`${entryPath}:${lineNum}:${lineContent.slice(0, 200)}`);
        }
      } catch {
        // Skip binary files
      }
    }
  }
}

export default fileSearchTool;
