import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';
import { indexRepository } from '../../../codegraph/sync.ts';

export const codeIndexTool: Tool = {
  definition: {
    name: 'code_index',
    description:
      'Index a codebase into the structural knowledge graph. Parses AST (tree-sitter), builds graph of functions, classes, calls, imports. Required before using other code_* tools.',
    capabilities: ['fs:read', 'db:write'],
    params: [
      {
        name: 'repo_path',
        type: 'string',
        description: 'Absolute path to the repository to index',
        required: true,
      },
      {
        name: 'project_name',
        type: 'string',
        description: 'Optional project name (defaults to directory name)',
        required: false,
      },
    ],
  },

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();
    const repoPath = String(args.repo_path ?? '');
    const projectName = args.project_name ? String(args.project_name) : undefined;

    try {
      const stat = await Deno.stat(repoPath).catch(() => null);
      if (!stat || !stat.isDirectory) {
        return {
          toolName: 'code_index',
          success: false,
          output: '',
          error: `Path not found or not a directory: ${repoPath}`,
          durationMs: Date.now() - start,
        };
      }

      const result = await indexRepository(repoPath, projectName);

      return {
        toolName: 'code_index',
        success: true,
        output: JSON.stringify(
          {
            project: result.project,
            nodes: result.nodeCount,
            edges: result.edgeCount,
            duration_ms: result.durationMs,
            message:
              `Indexed ${result.nodeCount} nodes and ${result.edgeCount} edges in ${result.durationMs}ms`,
          },
          null,
          2,
        ),
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        toolName: 'code_index',
        success: false,
        output: '',
        error: (err as Error).message,
        durationMs: Date.now() - start,
      };
    }
  },
};

export default codeIndexTool;
