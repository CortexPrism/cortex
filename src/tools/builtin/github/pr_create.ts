import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';
import { createPullRequest, getGitHubToken } from '../../../workspace/github.ts';

export const githubPRCreateTool: Tool = {
  definition: {
    name: 'github_pr_create',
    description: 'Create a pull request on GitHub. Requires a configured GitHub token.',
    capabilities: ['network:fetch'],
    params: [
      { name: 'repo', type: 'string', description: 'Repository (owner/name)', required: true },
      { name: 'title', type: 'string', description: 'PR title', required: true },
      { name: 'head', type: 'string', description: 'Head branch name', required: true },
      { name: 'base', type: 'string', description: 'Base branch name', required: true },
      { name: 'body', type: 'string', description: 'PR description', required: false },
      { name: 'draft', type: 'boolean', description: 'Create as draft PR', required: false },
    ],
  },

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();
    const token = await getGitHubToken();
    if (!token) {
      return { toolName: 'github_pr_create', success: false, output: '', error: 'No GitHub token configured', durationMs: 0 };
    }

    try {
      const pr = await createPullRequest(String(args.repo), token, {
        title: String(args.title),
        head: String(args.head),
        base: String(args.base),
        body: args.body ? String(args.body) : '',
        draft: Boolean(args.draft),
      });
      return {
        toolName: 'github_pr_create',
        success: true,
        output: `Created PR #${pr.number}: ${pr.title}\n${pr.html_url}`,
        durationMs: Date.now() - start,
      };
    } catch (e) {
      return { toolName: 'github_pr_create', success: false, output: '', error: (e as Error).message, durationMs: Date.now() - start };
    }
  },
};
