import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';
import { resolveWorkspacePath, ensureAgentWorkspace } from '../../../workspace/paths.ts';

export const fileListTool: Tool = {
  definition: {
    name: 'file_list',
    description: 'List directory contents with type markers.',
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
        name: 'recursive',
        type: 'boolean',
        description: 'Whether to list recursively',
        required: false,
      },
    ],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();
    const rawPath = String(args.path ?? '');
    const workspace = (args.workspace as 'agent' | 'global') ?? 'agent';
    const recursive = args.recursive === true;

    try {
      await ensureAgentWorkspace(context.agentId);
      const dirPath = resolveWorkspacePath(context.agentId, rawPath, workspace);

      const entries = await listEntries(dirPath, '', recursive);
      return {
        toolName: 'file_list',
        success: true,
        output: entries.join('\n'),
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        toolName: 'file_list',
        success: false,
        output: '',
        error: (err as Error).message,
        durationMs: Date.now() - start,
      };
    }
  },
};

async function listEntries(basePath: string, prefix: string, recursive: boolean): Promise<string[]> {
  const results: string[] = [];
  const dir = Deno.readDir(basePath);

  for await (const entry of dir) {
    const marker = entry.isDirectory ? 'd' : 'f';
    const line = `${marker}  ${prefix}${entry.name}`;
    results.push(line);

    if (recursive && entry.isDirectory) {
      const sub = await listEntries(`${basePath}/${entry.name}`, `${prefix}${entry.name}/`, true);
      results.push(...sub);
    }
  }

  return results.sort((a, b) => a.localeCompare(b));
}

export default fileListTool;
