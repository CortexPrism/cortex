import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';
import { gitPush, gitAdd, gitCommit } from '../../../workspace/git.ts';
import { ensureAgentWorkspace } from '../../../workspace/paths.ts';

export const gitPushTool: Tool = {
  definition: {
    name: 'git_push',
    description: 'Stage all changes, commit, and push to a remote repository. Creates a commit with the given message then pushes.',
    capabilities: ['shell:run'],
    params: [
      { name: 'message', type: 'string', description: 'Commit message', required: true },
      { name: 'branch', type: 'string', description: 'Branch to push (defaults to current)', required: false },
      { name: 'remote', type: 'string', description: 'Remote name (default: origin)', required: false },
    ],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();
    const dir = context.workspaceDir || await ensureAgentWorkspace(context.agentId);

    try {
      await gitAdd(dir, ['-A']);
      await gitCommit(dir, String(args.message));
      const result = await gitPush(dir, String(args.remote || 'origin'), args.branch ? String(args.branch) : undefined);
      return {
        toolName: 'git_push',
        success: result.success,
        output: result.success ? 'Changes committed and pushed.' : `Push failed:\n${result.output}`,
        error: result.success ? undefined : 'Push failed',
        durationMs: Date.now() - start,
      };
    } catch (e) {
      return { toolName: 'git_push', success: false, output: '', error: (e as Error).message, durationMs: Date.now() - start };
    }
  },
};
