import type { Tool, ToolCapability, ToolDefinition } from './types.ts';
import { createMcpToolWrapper, inferCapabilitiesFromMcpTool } from './mcp-adapter.ts';
import { getConnection } from '../mcp/client.ts';

// Builtin tool imports (consolidated from all entry points)
import { fileReadTool } from './builtin/file_read.ts';
import { fileReadEnhancedTool } from './builtin/file_read_enhanced.ts';
import { webSearchTool } from './builtin/web_search.ts';
import { webSearchEnhancedTool } from './builtin/web/search_enhanced.ts';
import { webFetchEnhancedTool } from './builtin/web/fetch_enhanced.ts';
import { codeExecTool } from './builtin/code_exec.ts';
import { subAgentTool } from './builtin/sub_agent.ts';
import { nodeDispatchTool } from './builtin/node_dispatch.ts';
import { loadSkillTool } from './builtin/load_skill.ts';
import { skillWriteTool } from './builtin/skill_write.ts';
import { skillReadTool } from './builtin/skill_read.ts';
import { dashboardManageTool } from './builtin/dashboard_manage.ts';
import { memoryNoteTool } from './builtin/memory_note.ts';
import { memorySearchTool } from './builtin/memory_search.ts';
import { dbQueryTool } from './builtin/db_query.ts';
import { browserTool } from './builtin/browser.ts';
import { docsSearchTool } from './builtin/docs_search.ts';
import { structuredExtractTool } from './builtin/structured_extract.ts';
import { jsonQueryTool } from './builtin/json_query.ts';
import { regexUtilsTool } from './builtin/regex_utils.ts';
import { envManagerTool } from './builtin/env_manager.ts';
import { codeSnippetTool } from './builtin/code_snippet.ts';
import { imageAnalyzeTool } from './builtin/image_analyze.ts';
import { scheduleTool } from './builtin/schedule.ts';
import { speakTool } from './builtin/speak.ts';
import { listenTool } from './builtin/listen.ts';
import { shellTool } from './builtin/shell.ts';
import { webFetchTool } from './builtin/web_fetch.ts';
import { braveSearchTool } from './builtin/web/brave_search.ts';
import { tavilySearchTool } from './builtin/web/tavily_search.ts';
import { serpapiSearchTool } from './builtin/web/serpapi_search.ts';
import { firecrawlTool } from './builtin/web/firecrawl.ts';
import { computerTool } from './builtin/computer.ts';
import { mcpAgentTool } from './builtin/mcp_agent.ts';
import { fileGlobTool } from './builtin/workspace/file_glob.ts';
import {
  githubIssueCreateTool,
  githubIssueListTool,
  githubPRCreateTool,
  githubPRListTool,
  gitPushTool,
} from './builtin/github/index.ts';
import {
  fileCopyTool,
  fileDeleteTool,
  fileEditTool,
  fileInfoTool,
  fileListTool,
  fileMoveTool,
  filePatchTool,
  fileRedoTool,
  fileRenameTool,
  fileSearchTool,
  fileTreeTool,
  fileUndoTool,
  fileWriteTool,
} from './builtin/workspace/index.ts';

export class ToolRegistry {
  private tools = new Map<string, Tool>();
  private mcpTools = new Set<string>();

  register(tool: Tool): void {
    this.tools.set(tool.definition.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }

  definitions(): ToolDefinition[] {
    return this.list().map((t) => t.definition);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  toolNames(): string[] {
    return [...this.tools.keys()];
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  async loadEsm(specifier: string): Promise<void> {
    const mod = await import(specifier) as { default?: Tool; tool?: Tool };
    const tool = mod.default ?? mod.tool;
    if (!tool || typeof tool.execute !== 'function') {
      throw new Error(`Module ${specifier} does not export a valid Tool`);
    }
    this.register(tool);
  }

  async registerMcpConnection(
    connectionName: string,
    prefix: string,
    capabilityOverrides?: Record<string, ToolCapability[]>,
  ): Promise<number> {
    const conn = getConnection(connectionName);
    if (!conn) {
      throw new Error(`MCP connection "${connectionName}" not found`);
    }
    if (!conn.connected) {
      throw new Error(`MCP connection "${connectionName}" is not connected`);
    }

    let registered = 0;
    for (const toolDef of conn.tools) {
      const toolName = `${prefix}${toolDef.name}`;
      if (this.tools.has(toolName)) {
        continue;
      }

      const capabilities = capabilityOverrides?.[toolDef.name] ??
        inferCapabilitiesFromMcpTool(toolDef);

      const tool = createMcpToolWrapper(connectionName, toolDef, capabilities);
      this.tools.set(toolName, tool);
      this.mcpTools.add(toolName);
      registered++;
    }

    return registered;
  }

  unregisterByPrefix(prefix: string): void {
    for (const name of this.tools.keys()) {
      if (name.startsWith(prefix)) {
        this.tools.delete(name);
        this.mcpTools.delete(name);
      }
    }
  }
}

export const globalRegistry = new ToolRegistry();

/**
 * Register all builtin tools
 * Centralized registration function to eliminate duplication across entry points
 *
 * @param registry — Tool registry instance (defaults to globalRegistry)
 * @param includeCodograph — Include codegraph tools (async imports, default: true)
 * @returns Promise<Record<string, Tool>> — Map of all registered tools
 */
export async function registerAllBuiltins(
  registry: ToolRegistry = globalRegistry,
  includeCodograph = true,
): Promise<Record<string, Tool>> {
  // ═════════════════════════════════════════════════════════
  // File System Tools (workspace with undo/redo)
  // ═════════════════════════════════════════════════════════
  const fileTools = {
    file_read: fileReadTool,
    file_read_enhanced: fileReadEnhancedTool,
    file_write: fileWriteTool,
    file_edit: fileEditTool,
    file_patch: filePatchTool,
    file_delete: fileDeleteTool,
    file_rename: fileRenameTool,
    file_copy: fileCopyTool,
    file_move: fileMoveTool,
    file_list: fileListTool,
    file_tree: fileTreeTool,
    file_info: fileInfoTool,
    file_search: fileSearchTool,
    file_glob: fileGlobTool,
    file_undo: fileUndoTool,
    file_redo: fileRedoTool,
  };

  // ═════════════════════════════════════════════════════════
  // Web Tools (search, fetch, crawl)
  // ═════════════════════════════════════════════════════════
  const webTools = {
    web_search: webSearchTool,
    web_search_enhanced: webSearchEnhancedTool,
    web_fetch: webFetchTool,
    web_fetch_enhanced: webFetchEnhancedTool,
    brave_search: braveSearchTool,
    tavily_search: tavilySearchTool,
    serpapi_search: serpapiSearchTool,
    firecrawl: firecrawlTool,
    docs_search: docsSearchTool,
  };

  // ═════════════════════════════════════════════════════════
  // Code Execution & Computer Control
  // ═════════════════════════════════════════════════════════
  const execTools = {
    code_exec: codeExecTool,
    shell: shellTool,
    computer: computerTool,
    browser: browserTool,
  };

  // ═════════════════════════════════════════════════════════
  // Agent Orchestration & Skills
  // ═════════════════════════════════════════════════════════
  const agentTools = {
    sub_agent: subAgentTool,
    node_dispatch: nodeDispatchTool,
    load_skill: loadSkillTool,
    skill_write: skillWriteTool,
    skill_read: skillReadTool,
    mcp_agent: mcpAgentTool,
    image_analyze: imageAnalyzeTool,
    structured_extract: structuredExtractTool,
  };

  // ═════════════════════════════════════════════════════════
  // GitHub Integration
  // ═════════════════════════════════════════════════════════
  const githubTools = {
    github_pr_create: githubPRCreateTool,
    github_pr_list: githubPRListTool,
    github_issue_create: githubIssueCreateTool,
    github_issue_list: githubIssueListTool,
    git_push: gitPushTool,
  };

  // ═════════════════════════════════════════════════════════
  // Database & Queries
  // ═════════════════════════════════════════════════════════
  const databaseTools = {
    db_query: dbQueryTool,
  };

  // ═════════════════════════════════════════════════════════
  // Scheduling & Automation
  // ═════════════════════════════════════════════════════════
  const schedulingTools = {
    schedule: scheduleTool,
  };

  // ═════════════════════════════════════════════════════════
  // Memory & Voice
  // ═════════════════════════════════════════════════════════
  const utilityTools = {
    memory_note: memoryNoteTool,
    memory_search: memorySearchTool,
    json_query: jsonQueryTool,
    regex_utils: regexUtilsTool,
    env_manager: envManagerTool,
    code_snippet: codeSnippetTool,
    speak: speakTool,
    listen: listenTool,
    dashboard_manage: dashboardManageTool,
  };

  // ═════════════════════════════════════════════════════════
  // Codegraph Tools (async imports)
  // ═════════════════════════════════════════════════════════
  const codegraphTools: Record<string, Tool> = {};

  if (includeCodograph) {
    codegraphTools.code_index = (await import('./builtin/codegraph/code_index.ts')).default;
    codegraphTools.code_search_symbol =
      (await import('./builtin/codegraph/code_search_symbol.ts')).default;
    codegraphTools.code_trace_path = (await import('./builtin/codegraph/code_trace_path.ts'))
      .default;
    codegraphTools.code_get_architecture =
      (await import('./builtin/codegraph/code_architecture.ts')).default;
    codegraphTools.code_analyze_impact = (await import('./builtin/codegraph/code_impact.ts'))
      .default;
    codegraphTools.code_list_projects =
      (await import('./builtin/codegraph/code_list_projects.ts')).default;
    codegraphTools.code_pilot = (await import('./builtin/codegraph/code_pilot.ts')).default;
  }

  // Combine all tools
  const allTools = {
    ...fileTools,
    ...webTools,
    ...execTools,
    ...agentTools,
    ...githubTools,
    ...databaseTools,
    ...schedulingTools,
    ...utilityTools,
    ...codegraphTools,
  };

  // Register all tools
  for (const tool of Object.values(allTools)) {
    registry.register(tool);
  }

  return allTools;
}
