import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';
import {
  ensureAgentWorkspace,
  getAgentWorkspaceDir,
  getGlobalWorkspaceDir,
  resolveWorkspacePath,
} from '../../../workspace/paths.ts';
import { gitAutoCommit, gitEnsureBranch } from '../../../workspace/git.ts';
import { logFileEdit } from './common.ts';

export const fileDeleteTool: Tool = {
  definition: {
    name: 'file_delete',
    description: 'Delete a file or directory in the workspace.',
    capabilities: ['fs:write'],
    params: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to the file or directory to delete',
        required: true,
      },
      {
        name: 'recursive',
        type: 'boolean',
        description: 'Whether to recursively delete a directory',
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
    const rawPath = String(args.path ?? '');
    const recursive = args.recursive === true;
    const workspace = (args.workspace as 'agent' | 'global') ?? 'agent';

    try {
      await ensureAgentWorkspace(context.agentId);
      const filePath = resolveWorkspacePath(context.agentId, rawPath, workspace);

      const rootDir = workspace === 'agent'
        ? getAgentWorkspaceDir(context.agentId)
        : getGlobalWorkspaceDir();
      if (
        resolveWorkspacePath(context.agentId, filePath, workspace) ===
          resolveWorkspacePath(context.agentId, rootDir, workspace)
      ) {
        throw new Error('Cannot delete workspace root');
      }

      let beforeText = '';
      try {
        beforeText = await Deno.readTextFile(filePath);
      } catch {
        // Directory or non-text file
      }

      const stat = await Deno.stat(filePath);
      if (stat.isDirectory && !recursive) {
        throw new Error(`"${filePath}" is a directory; use recursive=true to delete it`);
      }

      if (stat.isDirectory) {
        await Deno.remove(filePath, { recursive: true });
      } else {
        await Deno.remove(filePath);
      }

      const workspaceDir = workspace === 'agent'
        ? await ensureAgentWorkspace(context.agentId)
        : Deno.cwd();

      await gitEnsureBranch(workspaceDir, `workspace/${context.agentId}`);
      await gitAutoCommit(workspaceDir, context.agentId, filePath, 'file_delete');

      await logFileEdit({
        agentId: context.agentId,
        sessionId: context.sessionId,
        workspaceType: workspace,
        filePath,
        beforeText,
        afterText: '',
        tool: 'file_delete',
      });

      return {
        toolName: 'file_delete',
        success: true,
        output: `Deleted ${filePath}`,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        toolName: 'file_delete',
        success: false,
        output: '',
        error: (err as Error).message,
        durationMs: Date.now() - start,
      };
    }
  },
};

export default fileDeleteTool;
