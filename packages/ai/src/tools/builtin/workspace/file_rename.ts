import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';
import {
  ensureAgentWorkspace,
  resolveWorkspacePath,
} from '../../../../../../src/workspace/paths.ts';
import { gitAutoCommit, gitEnsureBranch } from '../../../../../../src/workspace/git.ts';
import { logFileEdit } from './common.ts';

export const fileRenameTool: Tool = {
  definition: {
    name: 'file_rename',
    description: 'Rename or move a file within the same workspace.',
    capabilities: ['fs:write'],
    params: [
      {
        name: 'source',
        type: 'string',
        description: 'Current path of the file or directory',
        required: true,
      },
      {
        name: 'dest',
        type: 'string',
        description: 'New path for the file or directory',
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
    const sourcePath = String(args.source ?? '');
    const destPath = String(args.dest ?? '');
    const workspace = (args.workspace as 'agent' | 'global') ?? 'agent';

    try {
      await ensureAgentWorkspace(context.agentId);
      const src = resolveWorkspacePath(context.agentId, sourcePath, workspace);
      const dest = resolveWorkspacePath(context.agentId, destPath, workspace);

      await Deno.rename(src, dest);

      const workspaceDir = workspace === 'agent'
        ? await ensureAgentWorkspace(context.agentId)
        : Deno.cwd();

      await gitEnsureBranch(workspaceDir, `workspace/${context.agentId}`);
      await gitAutoCommit(workspaceDir, context.agentId, src, 'file_rename');

      await logFileEdit({
        agentId: context.agentId,
        sessionId: context.sessionId,
        workspaceType: workspace,
        filePath: src,
        beforeText: '',
        afterText: `renamed to ${dest}`,
        tool: 'file_rename',
      });

      return {
        toolName: 'file_rename',
        success: true,
        output: `Renamed ${src} -> ${dest}`,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        toolName: 'file_rename',
        success: false,
        output: '',
        error: (err as Error).message,
        durationMs: Date.now() - start,
      };
    }
  },
};

export default fileRenameTool;
