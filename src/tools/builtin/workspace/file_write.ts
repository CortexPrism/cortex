import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';
import { ensureAgentWorkspace, resolveWorkspacePath } from '../../../workspace/paths.ts';
import { gitAutoCommit, gitEnsureBranch } from '../../../workspace/git.ts';
import { logFileEdit } from './common.ts';

export const fileWriteTool: Tool = {
  definition: {
    name: 'file_write',
    description: 'Create or overwrite a file in the workspace.',
    capabilities: ['fs:write'],
    params: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to the file (relative or absolute within workspace)',
        required: true,
      },
      {
        name: 'content',
        type: 'string',
        description: 'Content to write to the file',
        required: true,
      },
      {
        name: 'workspace',
        type: 'string',
        description: 'Target workspace: "agent" (default), "global", or "config" (for SOUL.md, USER.md, MEMORY.md)',
        required: false,
        enum: ['agent', 'global', 'config'],
      },
    ],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();
    const rawPath = String(args.path ?? '');
    const content = String(args.content ?? '');
    const SOUL_FILES = new Set(['USER.md', 'SOUL.md', 'MEMORY.md']);
    const explicitWorkspace = args.workspace as 'agent' | 'global' | 'config' | undefined;
    const workspace: 'agent' | 'global' | 'config' = explicitWorkspace ??
      (SOUL_FILES.has(rawPath) ? 'config' : 'agent');

    try {
      if (workspace !== 'config') await ensureAgentWorkspace(context.agentId);
      const filePath = resolveWorkspacePath(context.agentId, rawPath, workspace);

      const existing = await Deno.readTextFile(filePath).catch(() => '');
      await Deno.writeTextFile(filePath, content);

      if (workspace !== 'config') {
        const workspaceDir = workspace === 'agent'
          ? await ensureAgentWorkspace(context.agentId)
          : Deno.cwd();
        await gitEnsureBranch(workspaceDir, `workspace/${context.agentId}`);
        await gitAutoCommit(workspaceDir, context.agentId, filePath, 'file_write');
      }

      await logFileEdit({
        agentId: context.agentId,
        sessionId: context.sessionId,
        workspaceType: workspace,
        filePath,
        beforeText: existing,
        afterText: content,
        tool: 'file_write',
      });

      return {
        toolName: 'file_write',
        success: true,
        output: `Wrote ${filePath} (${content.length} bytes)`,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        toolName: 'file_write',
        success: false,
        output: '',
        error: (err as Error).message,
        durationMs: Date.now() - start,
      };
    }
  },
};

export default fileWriteTool;
