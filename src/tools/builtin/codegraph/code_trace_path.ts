import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';
import { getProject, tracePath } from '../../../codegraph/graph.ts';

export const codeTracePathTool: Tool = {
  definition: {
    name: 'code_trace_path',
    description:
      'Trace call paths through the code graph. Find what calls a function (inbound), what it calls (outbound), or both. BFS traversal up to depth 5. Requires prior code_index.',
    capabilities: ['db:read'],
    params: [
      {
        name: 'function_name',
        type: 'string',
        description: 'Function or method name to trace (partial match supported)',
        required: true,
      },
      {
        name: 'project_name',
        type: 'string',
        description: 'Project name (use code_list_projects to discover)',
        required: false,
      },
      {
        name: 'direction',
        type: 'string',
        description: 'Traversal direction: inbound (callers), outbound (callees), or both',
        required: false,
        enum: ['inbound', 'outbound', 'both'],
      },
      {
        name: 'max_depth',
        type: 'number',
        description: 'Maximum traversal depth (1-5, default: 3)',
        required: false,
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Maximum results (default: 50)',
        required: false,
      },
    ],
  },

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();
    const functionName = String(args.function_name ?? '');
    const projectName = args.project_name ? String(args.project_name) : undefined;
    const direction = (args.direction as 'inbound' | 'outbound' | 'both') ?? 'both';
    const maxDepth = typeof args.max_depth === 'number' ? Math.min(args.max_depth, 5) : 3;
    const limit = typeof args.limit === 'number' ? args.limit : 50;

    try {
      let projectId = 0;
      if (projectName) {
        const project = await getProject(projectName);
        if (!project) {
          return {
            toolName: 'code_trace_path',
            success: false,
            output: '',
            error: `Project not found: ${projectName}`,
            durationMs: Date.now() - start,
          };
        }
        projectId = project.id;
      } else {
        const { listProjects } = await import('../../../codegraph/graph.ts');
        const projects = await listProjects();
        if (projects.length === 0) {
          return {
            toolName: 'code_trace_path',
            success: false,
            output: '',
            error: 'No indexed projects. Run code_index first.',
            durationMs: Date.now() - start,
          };
        }
        projectId = projects[0].id;
      }

      const results = await tracePath(projectId, functionName, {
        direction,
        maxDepth,
        limit,
      });

      const inbound = results.filter((r) => r.direction === 'inbound');
      const outbound = results.filter((r) => r.direction === 'outbound');

      const output = {
        function: functionName,
        direction,
        total_results: results.length,
        callers: inbound.map((r) => ({
          name: r.node.name,
          file: r.node.file_path,
          line: r.node.line_start,
          confidence: r.edge.confidence.toFixed(2),
          depth: r.depth,
        })),
        callees: outbound.map((r) => ({
          name: r.node.name,
          file: r.node.file_path,
          line: r.node.line_start,
          confidence: r.edge.confidence.toFixed(2),
          depth: r.depth,
        })),
      };

      return {
        toolName: 'code_trace_path',
        success: true,
        output: results.length === 0
          ? `No call paths found for "${functionName}". Try code_search_symbol first to find the exact name.`
          : JSON.stringify(output, null, 2),
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        toolName: 'code_trace_path',
        success: false,
        output: '',
        error: (err as Error).message,
        durationMs: Date.now() - start,
      };
    }
  },
};

export default codeTracePathTool;
