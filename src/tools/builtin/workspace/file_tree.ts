import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';
import { resolveWorkspacePath, ensureAgentWorkspace } from '../../../workspace/paths.ts';

export const fileTreeTool: Tool = {
  definition: {
    name: 'file_tree',
    description: 'Display an indented tree view of the directory structure.',
    capabilities: ['fs:list'],
    params: [
      {
        name: 'path',
        type: 'string',
        description: 'Directory path (default: workspace root)',
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
        name: 'maxDepth',
        type: 'number',
        description: 'Maximum depth to traverse (default: 5)',
        required: false,
      },
    ],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();
    const rawPath = String(args.path ?? '');
    const workspace = (args.workspace as 'agent' | 'global') ?? 'agent';
    const maxDepth = typeof args.maxDepth === 'number' ? args.maxDepth : 5;

    try {
      await ensureAgentWorkspace(context.agentId);
      const dirPath = resolveWorkspacePath(context.agentId, rawPath, workspace);

      const lines: string[] = [dirPath];
      await buildTree(dirPath, '', lines, maxDepth, 0);

      return {
        toolName: 'file_tree',
        success: true,
        output: lines.join('\n'),
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        toolName: 'file_tree',
        success: false,
        output: '',
        error: (err as Error).message,
        durationMs: Date.now() - start,
      };
    }
  },
};

async function buildTree(
  dirPath: string,
  prefix: string,
  lines: string[],
  maxDepth: number,
  depth: number,
): Promise<void> {
  if (depth >= maxDepth) return;

  const entries: string[] = [];
  const dir = Deno.readDir(dirPath);
  for await (const entry of dir) {
    entries.push(entry.name);
  }
  entries.sort((a, b) => a.localeCompare(b));

  for (let i = 0; i < entries.length; i++) {
    const isLast = i === entries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const entryPath = `${dirPath}/${entries[i]}`;

    let stat: Deno.FileInfo;
    try {
      stat = await Deno.stat(entryPath);
    } catch {
      lines.push(`${prefix}${connector}${entries[i]}`);
      continue;
    }

    if (stat.isDirectory) {
      lines.push(`${prefix}${connector}${entries[i]}/`);
      const childPrefix = isLast ? '    ' : '│   ';
      await buildTree(entryPath, `${prefix}${childPrefix}`, lines, maxDepth, depth + 1);
    } else {
      lines.push(`${prefix}${connector}${entries[i]}`);
    }
  }
}

export default fileTreeTool;
