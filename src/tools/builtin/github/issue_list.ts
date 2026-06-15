import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';
import { listIssues, getGitHubToken } from '../../../workspace/github.ts';

export const githubIssueListTool: Tool = {
  definition: {
    name: 'github_issue_list',
    description: 'List issues on a GitHub repository.',
    capabilities: ['network:fetch'],
    params: [
      { name: 'repo', type: 'string', description: 'Repository (owner/name)', required: true },
      { name: 'state', type: 'string', description: 'Filter: open, closed, all', required: false },
      { name: 'limit', type: 'number', description: 'Max results (default 10)', required: false },
      { name: 'labels', type: 'string', description: 'Comma-separated labels filter', required: false },
    ],
  },

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();
    const token = await getGitHubToken();
    if (!token) {
      return { toolName: 'github_issue_list', success: false, output: '', error: 'No GitHub token configured', durationMs: 0 };
    }

    try {
      const labels = args.labels ? String(args.labels).split(',').map((s) => s.trim()) : undefined;
      const issues = await listIssues(String(args.repo), token, {
        state: (args.state as 'open' | 'closed' | 'all') ?? 'open',
        limit: Number(args.limit) || 10,
        labels,
      });
      if (issues.length === 0) {
        return { toolName: 'github_issue_list', success: true, output: 'No issues found.', durationMs: Date.now() - start };
      }
      const output = issues.map((issue) => {
        const labelsStr = issue.labels.map((l) => l.name).join(', ');
        return `#${issue.number} [${issue.state}] ${issue.title}${labelsStr ? `\n  Labels: ${labelsStr}` : ''}\n  ${issue.html_url}`;
      }).join('\n');
      return { toolName: 'github_issue_list', success: true, output, durationMs: Date.now() - start };
    } catch (e) {
      return { toolName: 'github_issue_list', success: false, output: '', error: (e as Error).message, durationMs: Date.now() - start };
    }
  },
};
