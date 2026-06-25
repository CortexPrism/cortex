import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';
import { ensureAgentWorkspace, resolveWorkspacePath } from '../../../workspace/paths.ts';

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
    const ws = context.agentWorkspace;

    try {
      await ensureAgentWorkspace(context.agentId);
      const filePath = resolveWorkspacePath(context.agentId, rawPath, workspace);

      let type: string;
      let size: number;
      let mtime: string;
      let birthtime: string;
      let mode: string;

      if (ws && workspace === 'agent') {
        const s = await ws.stat(filePath);
        type = s.isFile ? 'file' : s.isDirectory ? 'directory' : 'other';
        size = s.size;
        mtime = s.mtime?.toISOString() ?? 'N/A';
        birthtime = 'N/A';
        mode = 'N/A';
      } else {
        const s = await Deno.stat(filePath);
        type = s.isFile ? 'file' : s.isDirectory ? 'directory' : s.isSymlink ? 'symlink' : 'other';
        size = s.size;
        mtime = s.mtime?.toISOString() ?? 'N/A';
        birthtime = s.birthtime?.toISOString() ?? 'N/A';
        mode = s.mode?.toString(8) ?? 'N/A';
      }

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
