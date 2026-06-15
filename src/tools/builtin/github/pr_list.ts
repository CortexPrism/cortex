import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';
import { listPullRequests, getGitHubToken } from '../../../workspace/github.ts';

export const githubPRListTool: Tool = {
  definition: {
    name: 'github_pr_list',
    description: 'List pull requests on a GitHub repository.',
    capabilities: ['network:fetch'],
    params: [
      { name: 'repo', type: 'string', description: 'Repository (owner/name)', required: true },
      { name: 'state', type: 'string', description: 'Filter: open, closed, all', required: false },
      { name: 'limit', type: 'number', description: 'Max results (default 10)', required: false },
    ],
  },

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();
    const token = await getGitHubToken();
    if (!token) {
      return { toolName: 'github_pr_list', success: false, output: '', error: 'No GitHub token configured', durationMs: 0 };
    }

    try {
      const prs = await listPullRequests(String(args.repo), token, {
        state: (args.state as 'open' | 'closed' | 'all') ?? 'open',
        limit: Number(args.limit) || 10,
      });
      if (prs.length === 0) {
        return { toolName: 'github_pr_list', success: true, output: 'No pull requests found.', durationMs: Date.now() - start };
      }
      const output = prs.map((pr) =>
        `#${pr.number} [${pr.state}] ${pr.title}\n  @${pr.user.login} · ${pr.head.ref} → ${pr.base.ref}\n  ${pr.html_url}`
      ).join('\n');
      return { toolName: 'github_pr_list', success: true, output, durationMs: Date.now() - start };
    } catch (e) {
      return { toolName: 'github_pr_list', success: false, output: '', error: (e as Error).message, durationMs: Date.now() - start };
    }
  },
};
