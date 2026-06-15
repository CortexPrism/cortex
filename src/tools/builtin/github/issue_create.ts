import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';
import { createIssue, getGitHubToken } from '../../../workspace/github.ts';

export const githubIssueCreateTool: Tool = {
  definition: {
    name: 'github_issue_create',
    description: 'Create an issue on GitHub.',
    capabilities: ['network:fetch'],
    params: [
      { name: 'repo', type: 'string', description: 'Repository (owner/name)', required: true },
      { name: 'title', type: 'string', description: 'Issue title', required: true },
      { name: 'body', type: 'string', description: 'Issue body/description', required: false },
      { name: 'labels', type: 'array', description: 'Array of label strings', required: false },
    ],
  },

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();
    const token = await getGitHubToken();
    if (!token) {
      return { toolName: 'github_issue_create', success: false, output: '', error: 'No GitHub token configured', durationMs: 0 };
    }

    try {
      const labels = Array.isArray(args.labels) ? args.labels.map(String) : undefined;
      const issue = await createIssue(String(args.repo), token, {
        title: String(args.title),
        body: args.body ? String(args.body) : '',
        labels,
      });
      return {
        toolName: 'github_issue_create',
        success: true,
        output: `Created issue #${issue.number}: ${issue.title}\n${issue.html_url}`,
        durationMs: Date.now() - start,
      };
    } catch (e) {
      return { toolName: 'github_issue_create', success: false, output: '', error: (e as Error).message, durationMs: Date.now() - start };
    }
  },
};
