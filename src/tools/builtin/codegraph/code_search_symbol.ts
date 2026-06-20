import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';
import { ftsSearchNodes, getProject, searchNodes } from '../../../codegraph/graph.ts';
import type { CodeNodeLabel, SearchResult } from '../../../codegraph/schema.ts';

export const codeSearchSymbolTool: Tool = {
  definition: {
    name: 'code_search_symbol',
    description:
      'Search for code symbols (functions, classes, methods, etc.) by name, label, file pattern. Uses FTS5 full-text search on the indexed code graph. Requires prior code_index.',
    capabilities: ['db:read'],
    params: [
      {
        name: 'query',
        type: 'string',
        description: 'Symbol name or keyword to search for',
        required: true,
      },
      {
        name: 'project_name',
        type: 'string',
        description: 'Project name (use code_list_projects to discover)',
        required: false,
      },
      {
        name: 'label',
        type: 'string',
        description:
          'Filter by node label: CodeFunction, CodeMethod, CodeClass, CodeInterface, CodeEnum, CodeType',
        required: false,
        enum: ['CodeFunction', 'CodeMethod', 'CodeClass', 'CodeInterface', 'CodeEnum', 'CodeType'],
      },
      {
        name: 'file_pattern',
        type: 'string',
        description: 'Filter by file path pattern (e.g. "src/server/")',
        required: false,
      },
      {
        name: 'language',
        type: 'string',
        description: 'Filter by programming language',
        required: false,
      },
      {
        name: 'is_exported',
        type: 'boolean',
        description: 'Filter to exported/public symbols only',
        required: false,
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Maximum results (default: 20, max: 100)',
        required: false,
      },
    ],
  },

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();
    const query = String(args.query ?? '');
    const projectName = args.project_name ? String(args.project_name) : undefined;
    const label = args.label as CodeNodeLabel | undefined;
    const filePattern = args.file_pattern ? String(args.file_pattern) : undefined;
    const language = args.language ? String(args.language) : undefined;
    const isExported = args.is_exported !== undefined ? Boolean(args.is_exported) : undefined;
    const limit = typeof args.limit === 'number' ? Math.min(args.limit, 100) : 20;

    try {
      let projectId = 0;
      if (projectName) {
        const project = await getProject(projectName);
        if (!project) {
          return {
            toolName: 'code_search_symbol',
            success: false,
            output: '',
            error:
              `Project not found: ${projectName}. Use code_list_projects to see indexed projects.`,
            durationMs: Date.now() - start,
          };
        }
        projectId = project.id;
      } else {
        const { listProjects } = await import('../../../codegraph/graph.ts');
        const projects = await listProjects();
        if (projects.length === 0) {
          return {
            toolName: 'code_search_symbol',
            success: false,
            output: '',
            error: 'No indexed projects. Run code_index first.',
            durationMs: Date.now() - start,
          };
        }
        projectId = projects[0].id;
      }

      const results = await ftsSearchNodes(projectId, query, {
        label: label ? [label] : undefined,
        language,
        limit,
      });

      if (results.length === 0 && filePattern) {
        const fileResults = await searchNodes(projectId, {
          namePattern: query,
          filePattern,
          label: label ? [label] : undefined,
          language,
          isExported,
          limit,
        });
        results.push(...fileResults);
      }

      const output = results.map((r: SearchResult) => ({
        name: r.node.name,
        qualified_name: r.node.qualified_name,
        label: r.node.label,
        file: r.node.file_path,
        line: r.node.line_start,
        signature: r.node.signature,
        language: r.node.language,
        exported: r.node.is_exported,
        complexity: r.node.complexity,
        score: r.score.toFixed(4),
      }));

      return {
        toolName: 'code_search_symbol',
        success: true,
        output: output.length === 0 ? 'No symbols found.' : JSON.stringify(output, null, 2),
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        toolName: 'code_search_symbol',
        success: false,
        output: '',
        error: (err as Error).message,
        durationMs: Date.now() - start,
      };
    }
  },
};

export default codeSearchSymbolTool;
