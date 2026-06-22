import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';
import {
  ensureAgentWorkspace,
  resolveWorkspacePath,
} from '../../../../../../src/workspace/paths.ts';

export const fileInfoTool: Tool = {
  definition: {
    name: 'file_info',
    description: 'Get metadata for a file or directory.',
    capabilities: ['fs:read'],
    params: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to the file or directory',
        required: true,
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
    const rawPath = String(args.path ?? '');
    const workspace = (args.workspace as 'agent' | 'global') ?? 'agent';

    try {
      await ensureAgentWorkspace(context.agentId);
      const filePath = resolveWorkspacePath(context.agentId, rawPath, workspace);

      const stat = await Deno.stat(filePath);
      const type = stat.isFile
        ? 'file'
        : stat.isDirectory
        ? 'directory'
        : stat.isSymlink
        ? 'symlink'
        : 'other';
      const size = stat.size;
      const mtime = stat.mtime?.toISOString() ?? 'N/A';
      const birthtime = stat.birthtime?.toISOString() ?? 'N/A';
      const mode = stat.mode?.toString(8) ?? 'N/A';

      const output = [
        `Path: ${filePath}`,
        `Type: ${type}`,
        `Size: ${size} bytes`,
        `Modified: ${mtime}`,
        `Created: ${birthtime}`,
        `Permissions: ${mode}`,
      ].join('\n');

      return {
        toolName: 'file_info',
        success: true,
        output,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        toolName: 'file_info',
        success: false,
        output: '',
        error: (err as Error).message,
        durationMs: Date.now() - start,
      };
    }
  },
};

export default fileInfoTool;
