import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';
import { listProjects } from '../../../../../../src/codegraph/graph.ts';
import type { CodeProject } from '../../../../../../src/codegraph/schema.ts';

export const codeListProjectsTool: Tool = {
  definition: {
    name: 'code_list_projects',
    description: 'List all indexed code projects with node and edge counts.',
    capabilities: ['db:read'],
    params: [],
  },

  async execute(_args: Record<string, unknown>, _context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();

    try {
      const projects = await listProjects();

      const output = projects.map((p: CodeProject) => ({
        name: p.name,
        nodes: p.node_count,
        edges: p.edge_count,
        indexed_at: p.indexed_at,
        git_commit: p.git_commit,
        version: p.version,
      }));

      return {
        toolName: 'code_list_projects',
        success: true,
        output: output.length === 0
          ? 'No projects indexed. Run code_index to index a codebase.'
          : JSON.stringify(output, null, 2),
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        toolName: 'code_list_projects',
        success: false,
        output: '',
        error: (err as Error).message,
        durationMs: Date.now() - start,
      };
    }
  },
};

export default codeListProjectsTool;
