import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';
import { createCodePilotConfig, optimizeCodebase, buildCodePilotPrompt } from '../../../codegraph/codebase-pilot.ts';
import { getProject, searchNodes } from '../../../codegraph/graph.ts';
import { join } from '@std/path';

export const codePilotTool: Tool = {
  definition: {
    name: 'code_pilot',
    description:
      'Optimize a codebase for LLM context consumption using token budgets, AST-aware pruning, and smart file selection. Returns token-optimized code chunks with dependency and symbol metadata. Requires prior code_index.',
    capabilities: ['db:read', 'fs:read'],
    params: [
      {
        name: 'project_name',
        type: 'string',
        description: 'Project name (uses most recently indexed if omitted)',
        required: false,
      },
      {
        name: 'max_tokens',
        type: 'number',
        description: 'Token budget (default: 8000, max: 64000)',
        required: false,
      },
      {
        name: 'include_imports',
        type: 'boolean',
        description: 'Include import statements (default: true)',
        required: false,
      },
      {
        name: 'include_comments',
        type: 'boolean',
        description: 'Include comments (default: false)',
        required: false,
      },
      {
        name: 'include_test_files',
        type: 'boolean',
        description: 'Include test files (default: false)',
        required: false,
      },
      {
        name: 'prune_private',
        type: 'boolean',
        description: 'Prune private/internal members (default: true)',
        required: false,
      },
      {
        name: 'file_pattern',
        type: 'string',
        description: 'Limit to files matching pattern (e.g. "src/server/")',
        required: false,
      },
    ],
  },

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();
    let saved: Record<string, unknown> = {};
    try {
      const { loadConfig } = await import('../../../config/config.ts');
      const cfg = await loadConfig();
      saved = (cfg as unknown as Record<string, unknown>);
    } catch { /* use defaults */ }
    const maxTokens = typeof args.max_tokens === 'number' ? Math.min(args.max_tokens, 64000) : (typeof saved.pilotBudget === 'number' ? saved.pilotBudget : 8000);
    const config = createCodePilotConfig({
      maxTokens: maxTokens,
      includeImports: args.include_imports !== undefined ? Boolean(args.include_imports) : (saved.pilotIncludeImports as boolean ?? true),
      includeComments: args.include_comments !== undefined ? Boolean(args.include_comments) : (saved.pilotIncludeComments as boolean ?? false),
      includeTestFiles: args.include_test_files !== undefined ? Boolean(args.include_test_files) : (saved.pilotIncludeTests as boolean ?? false),
      prunePrivateMembers: args.prune_private !== undefined ? Boolean(args.prune_private) : (![false].includes(saved.pilotPruningMode as boolean) ? true : false),
    });

    try {
      let files: Array<{ path: string; content: string }> = [];
      const projectName = args.project_name ? String(args.project_name) : undefined;

      if (projectName) {
        const project = await getProject(projectName);
        if (!project) {
          return {
            toolName: 'code_pilot',
            success: false,
            output: '',
            error: `Project not found: ${projectName}`,
            durationMs: Date.now() - start,
          };
        }
        const nodes = await searchNodes(project.id, { limit: 500 });
        const uniqueFiles = [
          ...new Set(
            nodes.map((n) => n.node.file_path).filter(Boolean) as string[],
          ),
        ];

        for (const relPath of uniqueFiles.slice(0, 100)) {
          const absPath = join(project.root_path, relPath);
          try {
            const content = await Deno.readTextFile(absPath);
            files.push({ path: relPath, content });
          } catch { /* skip unreadable */ }
        }
      } else {
        const { listProjects } = await import('../../../codegraph/graph.ts');
        const projects = await listProjects();
        if (projects.length > 0) {
          const p = projects[0];
          const nodes = await searchNodes(p.id, { limit: 300 });
          const uniqueFiles = [
            ...new Set(
              nodes.map((n) => n.node.file_path).filter(Boolean) as string[],
            ),
          ];
          for (const relPath of uniqueFiles.slice(0, 80)) {
            const absPath = join(p.root_path, relPath);
            try {
              const content = await Deno.readTextFile(absPath);
              files.push({ path: relPath, content });
            } catch { /* skip */ }
          }
        }
      }

      if (files.length === 0) {
        return {
          toolName: 'code_pilot',
          success: false,
          output: '',
          error: 'No indexed files found. Run code_index first.',
          durationMs: Date.now() - start,
        };
      }

      const filePattern = args.file_pattern ? String(args.file_pattern) : undefined;
      if (filePattern) {
        files = files.filter((f) => f.path.includes(filePattern));
      }

      const optimized = optimizeCodebase(files, config);
      const prompt = buildCodePilotPrompt(optimized, args.user_query ? String(args.user_query) : 'Analyze this codebase');

      return {
        toolName: 'code_pilot',
        success: true,
        output: JSON.stringify(
          {
            summary: optimized.summary,
            totalTokens: optimized.totalTokens,
            budgetRemaining: optimized.budgetRemaining,
            prompt: prompt,
            chunks: optimized.chunks.map((c) => ({
              file: c.filePath,
              language: c.language,
              kind: c.kind,
              tokens: c.tokens,
              symbols: c.symbols.slice(0, 15),
              dependencies: c.dependencies.slice(0, 10),
              content: c.content.slice(0, 500) + (c.content.length > 500 ? '...' : ''),
            })),
            excludedFiles: optimized.excludedFiles,
          },
          null,
          2,
        ),
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        toolName: 'code_pilot',
        success: false,
        output: '',
        error: (err as Error).message,
        durationMs: Date.now() - start,
      };
    }
  },
};

export default codePilotTool;
