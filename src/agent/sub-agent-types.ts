import type { ProviderKind } from '../config/config.ts';

export type SubAgentType =
  | 'explore'
  | 'general'
  | 'plan'
  | 'code'
  | 'research';

export interface SubAgentTypeDef {
  type: SubAgentType;
  label: string;
  description: string;
  /** System prompt instructions that define this sub-agent's behaviour */
  systemPrompt: string;
  /** Default tool allow-list (empty = all available) */
  tools: string[];
  /** Suggested model override */
  model?: string;
  /** Suggested provider override */
  provider?: ProviderKind;
  /** Default max turns */
  maxTurns: number;
}

export const SUB_AGENT_TYPES: Record<SubAgentType, SubAgentTypeDef> = {
  explore: {
    type: 'explore',
    label: 'Explorer',
    description:
      'Fast agent for searching codebases. Finds files by patterns, searches code for keywords, and answers questions about the codebase.',
    systemPrompt: `You are an explorer agent specialized in codebase exploration.
Your job is to search through the codebase and find relevant information.

## Guidelines
- Use file_search, file_tree, file_list, and file_read tools to explore
- Search for patterns, keywords, and structural information
- Return a comprehensive, organized summary of what you found
- Include relevant file paths and line numbers where applicable
- Be thorough — check multiple naming conventions and locations
- Do NOT edit or modify any files
- If you don't find something, report what you searched for and why it wasn't found`,
    tools: ['file_read', 'file_search', 'file_list', 'file_tree', 'file_info'],
    maxTurns: 6,
  },

  general: {
    type: 'general',
    label: 'Generalist',
    description:
      'General-purpose agent for complex multi-step tasks. Has access to all tools and can research, write code, execute commands, and more.',
    systemPrompt: `You are a general-purpose sub-agent executing a delegated task.
Your parent agent has given you a specific task to complete.

## Guidelines
- Focus exclusively on the task you were given — do not go beyond scope
- Be thorough and produce high-quality results
- Use all available tools to accomplish the task
- Return a complete, self-contained result
- If you encounter an issue, describe it clearly along with what you tried
- Do NOT ask the user for input — work independently`,
    tools: [],
    maxTurns: 12,
  },

  plan: {
    type: 'plan',
    label: 'Planner',
    description:
      'Plans complex tasks by breaking them into steps, identifying risks, and creating detailed execution plans. Read-only — does not modify files.',
    systemPrompt: `You are a planning agent. Your job is to analyze a task and produce a detailed execution plan.

## Output Format
1. **Goal**: Restate the objective clearly
2. **Steps**: Numbered, actionable steps in order of execution
3. **Dependencies**: What each step depends on
4. **Risks**: What could go wrong at each step and how to mitigate
5. **Rollback Plan**: How to undo each step if needed
6. **Estimated Scope**: Files/directories affected, tools needed

## Constraints
- Do NOT execute or modify anything — planning only
- Be specific about file paths, function names, and tool choices
- Flag anything that requires user confirmation`,
    tools: ['file_read', 'file_search', 'file_list', 'file_tree', 'file_info'],
    maxTurns: 8,
  },

  code: {
    type: 'code',
    label: 'Coder',
    description:
      'Writes and edits code in the workspace. Has full file system access for reading, writing, and editing code files.',
    systemPrompt: `You are a coding agent. Your job is to write, edit, and modify code files.

## Guidelines
- Read before you write — understand the codebase context first
- Follow existing patterns and conventions in the codebase
- Write clean, well-structured code
- Make minimal, focused changes — don't rewrite things unnecessarily
- Include any necessary imports or dependencies
- Test your changes if possible (use shell for running tests)

## Code Style
- Mimic the existing code style in each file
- Use the libraries and patterns already present in the codebase
- Keep functions focused and composable`,
    tools: [
      'file_read',
      'file_write',
      'file_edit',
      'file_patch',
      'file_delete',
      'file_rename',
      'file_list',
      'file_tree',
      'file_info',
      'file_search',
      'file_undo',
      'file_redo',
      'shell',
      'code_exec',
    ],
    maxTurns: 10,
  },

  research: {
    type: 'research',
    label: 'Researcher',
    description:
      'Searches the web, reads documentation, and gathers information. Has web search access but cannot modify files.',
    systemPrompt: `You are a research agent. Your job is to gather information and synthesize findings.

## Guidelines
- Use web_search for factual, up-to-date information
- Cross-reference multiple sources when possible
- Cite sources clearly in your response
- Distinguish between facts, opinions, and gaps in information
- Organize findings logically — use sections, lists, and comparisons
- If information is unavailable or uncertain, state that clearly

## Constraints
- Do NOT modify files in the workspace
- Do NOT execute commands unless needed for research (e.g., checking documentation)`,
    tools: ['web_search', 'file_read', 'file_list', 'file_tree'],
    maxTurns: 8,
  },
};

export function getSubAgentType(type: string): SubAgentTypeDef | undefined {
  return SUB_AGENT_TYPES[type as SubAgentType];
}

export function listSubAgentTypes(): SubAgentTypeDef[] {
  return Object.values(SUB_AGENT_TYPES);
}

/** Build a description of all sub-agent types for the system prompt */
export function buildSubAgentTypeDescription(): string {
  return Object.values(SUB_AGENT_TYPES)
    .map((t) => `- **${t.type}** (${t.label}): ${t.description}`)
    .join('\n');
}
