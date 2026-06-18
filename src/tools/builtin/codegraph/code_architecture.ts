import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';
import { getArchitecture, getProject } from '../../../codegraph/graph.ts';

export const codeArchitectureTool: Tool = {
  definition: {
    name: 'code_get_architecture',
    description:
      'Get a structural overview of the indexed codebase: languages, packages, entry points, routes, hotspots, and functional clusters. Requires prior code_index.',
    capabilities: ['db:read'],
    params: [
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
    const projectName = args.project_name ? String(args.project_name) : undefined;

    try {
      let projectId = 0;
      if (projectName) {
        const project = await getProject(projectName);
        if (!project) {
          return {
            toolName: 'code_get_architecture',
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
            toolName: 'code_get_architecture',
            success: false,
            output: '',
            error: 'No indexed projects. Run code_index first.',
            durationMs: Date.now() - start,
          };
        }
        projectId = projects[0].id;
      }

      const arch = await getArchitecture(projectId);

      return {
        toolName: 'code_get_architecture',
        success: true,
        output: JSON.stringify(arch, null, 2),
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        toolName: 'code_get_architecture',
        success: false,
        output: '',
        error: (err as Error).message,
        durationMs: Date.now() - start,
      };
    }
  },
};

export default codeArchitectureTool;
