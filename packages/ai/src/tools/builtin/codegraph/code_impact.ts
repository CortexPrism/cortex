import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';
import { getDeadCode, getProject, tracePath } from '../../../../../../src/codegraph/graph.ts';
import type { CodeNode, TraceResult } from '../../../../../../src/codegraph/schema.ts';

export const codeImpactTool: Tool = {
  definition: {
    name: 'code_analyze_impact',
    description:
      'Analyze the impact of changing a symbol. Finds all callers (dependent code), all callees (code it depends on), and detects dead code. Requires prior code_index.',
    capabilities: ['db:read'],
    params: [
      {
        name: 'symbol_name',
        type: 'string',
        description: 'Function, method, class, or interface name to analyze',
        required: true,
      },
      {
        name: 'project_name',
        type: 'string',
        description: 'Project name (uses most recently indexed if omitted)',
        required: false,
      },
    ],
  },

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();
    const symbolName = String(args.symbol_name ?? '');
    const projectName = args.project_name ? String(args.project_name) : undefined;

    try {
      let projectId = 0;
      if (projectName) {
        const project = await getProject(projectName);
        if (!project) {
          return {
            toolName: 'code_analyze_impact',
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
            toolName: 'code_analyze_impact',
            success: false,
            output: '',
            error: 'No indexed projects. Run code_index first.',
            durationMs: Date.now() - start,
          };
        }
        projectId = projects[0].id;
      }

      const callers: TraceResult[] = await tracePath(projectId, symbolName, {
        direction: 'inbound',
        maxDepth: 3,
        limit: 100,
      });

      const callees: TraceResult[] = await tracePath(projectId, symbolName, {
        direction: 'outbound',
        maxDepth: 3,
        limit: 100,
      });

      const callerSet = new Set(callers.map((c: TraceResult) => c.node.qualified_name));
      const calleeSet = new Set(callees.map((c: TraceResult) => c.node.qualified_name));

      const deadCode: CodeNode[] = await getDeadCode(projectId, { limit: 30 });

      const output = {
        symbol: symbolName,
        impact_summary: {
          direct_callers: callers.filter((c: TraceResult) => c.depth === 1).length,
          total_callers: callers.length,
          direct_callees: callees.filter((c: TraceResult) => c.depth === 1).length,
          total_callees: callees.length,
          blast_radius: callerSet.size + calleeSet.size,
        },
        callers: callers.filter((c: TraceResult) => c.depth === 1).map((c: TraceResult) => ({
          name: c.node.name,
          file: c.node.file_path,
          line: c.node.line_start,
          label: c.node.label,
        })),
        callees: callees.filter((c: TraceResult) => c.depth === 1).map((c: TraceResult) => ({
          name: c.node.name,
          file: c.node.file_path,
          line: c.node.line_start,
          label: c.node.label,
        })),
        transitive_dependents: callers.filter((c: TraceResult) => c.depth > 1).map((
          c: TraceResult,
        ) => ({
          name: c.node.name,
          depth: c.depth,
          file: c.node.file_path,
        })),
        potential_dead_code: deadCode.slice(0, 10).map((d: CodeNode) => ({
          name: d.name,
          file: d.file_path,
          complexity: d.complexity,
        })),
      };

      return {
        toolName: 'code_analyze_impact',
        success: true,
        output: JSON.stringify(output, null, 2),
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        toolName: 'code_analyze_impact',
        success: false,
        output: '',
        error: (err as Error).message,
        durationMs: Date.now() - start,
      };
    }
  },
};

export default codeImpactTool;
