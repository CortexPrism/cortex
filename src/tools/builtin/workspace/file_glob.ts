import { join } from '@std/path';
import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';
import { ensureAgentWorkspace, resolveWorkspacePath } from '../../../workspace/paths.ts';

const MAX_RESULTS = 200;
const MAX_DEPTH = 20;

export const fileGlobTool: Tool = {
  definition: {
    name: 'file_glob',
    description:
      'Find files matching a glob pattern (e.g. "**/*.ts", "src/**\/*.ts"). Returns relative file paths sorted by modification time.',
    capabilities: ['fs:list'],
    params: [
      {
        name: 'pattern',
        type: 'string',
        description: 'Glob pattern to match (e.g. "*.ts", "src/**\/*.ts", "**\/*.test.ts")',
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
    ],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();
    const pattern = String(args.pattern ?? '').trim();
    const rawPath = String(args.path ?? '');
    const workspace = (args.workspace as 'agent' | 'global') ?? 'agent';

    if (!pattern) {
      return {
        toolName: 'file_glob',
        success: false,
        output: '',
        error: 'Missing pattern',
        durationMs: Date.now() - start,
      };
    }

    try {
      await ensureAgentWorkspace(context.agentId);
      const baseDir = resolveWorkspacePath(context.agentId, rawPath, workspace);
      const regex = globToRegex(pattern);

      const results: Array<{ path: string; mtime: number }> = [];
      await walkDir(baseDir, baseDir, regex, results, 0);

      results.sort((a, b) => b.mtime - a.mtime);
      const output = results.length === 0
        ? 'No files matched the pattern.'
        : results.slice(0, MAX_RESULTS).map((r) => r.path).join('\n') +
          (results.length > MAX_RESULTS
            ? `\n... (${results.length} results, showing first ${MAX_RESULTS})`
            : '');

      return {
        toolName: 'file_glob',
        success: true,
        output,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        toolName: 'file_glob',
        success: false,
        output: '',
        error: (err as Error).message,
        durationMs: Date.now() - start,
      };
    }
  },
};

function globToRegex(pattern: string): RegExp {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/' || pattern[i + 2] === '\\') {
          re += '(?:.*\\/)?';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else {
        re += '[^/]*';
      }
    } else if (ch === '?') {
      re += '[^/]';
    } else if (ch === '.') {
      re += '\\.';
    } else if (ch === '/') {
      re += '\\/';
    } else {
      re += ch;
    }
  }
  return new RegExp('^' + re + '$');
}

async function walkDir(
  baseDir: string,
  currentDir: string,
  regex: RegExp,
  results: Array<{ path: string; mtime: number }>,
  depth: number,
): Promise<void> {
  if (depth > MAX_DEPTH || results.length >= MAX_RESULTS * 2) return;

  const entries: Deno.DirEntry[] = [];
  try {
    for await (const entry of Deno.readDir(currentDir)) {
      entries.push(entry);
    }
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= MAX_RESULTS * 2) return;
    const fullPath = `${currentDir}/${entry.name}`;
    const relativePath = fullPath.startsWith(baseDir + '/')
      ? fullPath.slice(baseDir.length + 1)
      : entry.name;

    if (entry.isDirectory) {
      if (!entry.name.startsWith('.') || entry.name === '.git') {
        await walkDir(baseDir, fullPath, regex, results, depth + 1);
      }
    } else if (entry.isFile) {
      if (regex.test(entry.name) || regex.test(relativePath)) {
        let mtime = 0;
        try {
          const stat = await Deno.stat(fullPath);
          mtime = stat.mtime ? stat.mtime.getTime() : 0;
        } catch { /* ignore stat errors */ }
        results.push({ path: relativePath, mtime });
      }
    }
  }
}

export default fileGlobTool;
