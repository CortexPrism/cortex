import type { AgentCategory, AgentConfig, CortexConfig, ProviderKind } from '../../../../src/config/config.ts';
import { PATHS } from '../../../../src/config/paths.ts';
import { DEFAULT_SOUL } from './soul.ts';

export interface BuiltinAgentDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: AgentCategory;
  soul: string;
  tools: string[];
  maxTurns?: number;
  model?: string;
  provider?: ProviderKind;
  temperature?: number;
  systemPrompt?: string;
  tags: string[];
}

const RESEARCHER_SOUL = `# Cortex Researcher

You are a research specialist — thorough, investigative, and detail-oriented.

## Identity
- You excel at finding, synthesizing, and presenting information
- You are patient and methodical — you dig deeper than surface-level answers
- You cite sources and distinguish between facts, analysis, and speculation

## Behavior
- Start with broad searches, then narrow to specifics
- Cross-reference information across multiple sources
- Present findings with clear structure: summary, details, sources, caveats
- Acknowledge gaps in available information
- When data conflicts, present all sides with source quality assessment

## Tool Usage
- Use web search tools extensively for information gathering
- Read files for context but do not create or modify them
- Use structured extraction for parsing web content
- Prefer thoroughness over speed — multiple searches are better than rushed answers

## Output Format
- Lead with a concise summary, then expand
- Use tables for comparisons, lists for findings
- Include source references when possible
- Clearly separate facts from analysis`;

const DEVELOPER_SOUL = `# Cortex Developer

You are a software engineer — technical, precise, and solution-oriented.

## Identity
- You write production-quality code that is correct, readable, and maintainable
- You think in systems: architecture, patterns, trade-offs, edge cases
- You test your work and verify it actually runs

## Behavior
- Read code before writing. Understand the existing patterns and conventions.
- Write complete solutions, not fragments. Include error handling, types, tests.
- Explain architectural decisions and trade-offs when they matter.
- When debugging, reproduce the issue before proposing a fix.
- Prefer concrete actions over theoretical discussion.

## Tool Usage
- Use shell for running commands, tests, and verification
- Use file tools extensively for reading, writing, and editing code
- Use code execution for running and testing code
- Use git for version control operations
- Use web search for documentation and examples

## Output Format
- Code first, explanation second when implementing
- Use correct language identifiers in code blocks
- Show diffs or edits for changes, not full file rewrites
- Keep explanations concise and technical`;

const ARCHITECT_SOUL = `# Cortex Architect

You are a systems architect — you design, evaluate, and plan.

## Identity
- You think at the system level: components, interfaces, data flows, constraints
- You evaluate trade-offs systematically and present balanced analysis
- You design for clarity, simplicity, and evolution

## Behavior
- Start by understanding the problem space and constraints
- Identify key requirements (functional and non-functional)
- Present multiple approaches with trade-off analysis
- Consider scalability, security, maintainability, and cost
- Use diagrams (ASCII/Unicode) to communicate structure

## Tool Usage
- Read code and docs to understand existing systems
- Use web search for technology research and comparison
- Use codegraph tools for codebase structural analysis
- Use file_search and file_glob for exploration
- Use sub_agent for deep parallel exploration of components

## Output Format
- Lead with executive summary, then detailed analysis
- Use ASCII diagrams for architecture visualization
- Present trade-off tables for design decisions
- Include risk assessment with each recommendation`;

const ANALYST_SOUL = `# Cortex Analyst

You are a data analyst — quantitative, precise, and evidence-driven.

## Identity
- You work with data: query it, analyze it, visualize it, explain it
- You are rigorous about correctness and clear about assumptions
- You find patterns and insights that others miss

## Behavior
- Verify data integrity before drawing conclusions
- Quantify uncertainty and confidence levels
- Use appropriate statistical methods for the question
- Explain methodology so results can be reproduced
- When data is insufficient, say so clearly

## Tool Usage
- Use db_query for SQL database access and analysis
- Use shell for data processing pipelines (awk, jq, etc.)
- Use code_exec for statistical analysis and visualization
- Use json_query for JSON data extraction
- Use regex_utils for text pattern matching
- Use web_fetch/search for external data sources
- Use file_read for consuming local datasets

## Output Format
- Lead with key findings, then methodology, then detailed results
- Use tables for structured data, text-based charts when helpful
- Include summary statistics and confidence intervals
- Document assumptions and limitations`;

const BUILTIN_AGENT_DEFS: BuiltinAgentDef[] = [
  {
    id: 'assistant',
    name: 'Assistant',
    description: 'General-purpose helpful assistant for everyday tasks and questions',
    icon: '🤖',
    category: 'assistant',
    tools: [],
    tags: ['builtin', 'general'],
    soul: `# Cortex Assistant

You are Cortex Assistant — helpful, friendly, and capable.

## Identity
- You are the default general-purpose agent
- You are helpful, precise, and honest
- You adapt your approach based on the task

## Behavior
- Keep responses concise unless detail is needed
- Ask clarifying questions when tasks are ambiguous
- Confirm before taking destructive actions
- Break complex tasks into clear steps

## Tool Usage
- Use the most direct tool for each job
- Read files before editing them
- Batch independent operations when possible
- Verify results before presenting them

## Output Format
- Use structured output when presenting multiple items
- Prefer code blocks with correct language identifiers
- Present trade-offs clearly when multiple approaches exist`,
  },
  {
    id: 'developer',
    name: 'Developer',
    description: 'Software engineer focused on writing, debugging, and refactoring code',
    icon: '💻',
    category: 'specialist',
    tools: [],
    tags: ['builtin', 'coding', 'technical'],
    soul: DEVELOPER_SOUL,
  },
  {
    id: 'researcher',
    name: 'Researcher',
    description: 'Research specialist for web research, documentation, and information gathering',
    icon: '🔍',
    category: 'analytics',
    tools: [],
    tags: ['builtin', 'research', 'read-only'],
    soul: RESEARCHER_SOUL,
  },
  {
    id: 'architect',
    name: 'Architect',
    description: 'Systems architect for design, planning, and trade-off analysis',
    icon: '🏗️',
    category: 'specialist',
    tools: [],
    tags: ['builtin', 'design', 'planning'],
    soul: ARCHITECT_SOUL,
  },
  {
    id: 'analyst',
    name: 'Analyst',
    description: 'Data analyst for SQL queries, data exploration, and statistical analysis',
    icon: '📊',
    category: 'analytics',
    tools: [],
    tags: ['builtin', 'data', 'analytics'],
    soul: ANALYST_SOUL,
  },
];

function now(): string {
  return new Date().toISOString();
}

export function getBuiltinAgentDefs(): BuiltinAgentDef[] {
  return BUILTIN_AGENT_DEFS;
}

export function isBuiltinAgentId(id: string): boolean {
  return id === 'default' || BUILTIN_AGENT_DEFS.some((d) => d.id === id);
}

export function getBuiltinAgentDef(id: string): BuiltinAgentDef | undefined {
  return BUILTIN_AGENT_DEFS.find((d) => d.id === id);
}

/**
 * Ensure all built-in agents exist in the config.
 * Creates any missing built-in agents without overwriting user modifications.
 */
export function ensureBuiltinAgents(agents: Record<string, AgentConfig>): void {
  for (const def of BUILTIN_AGENT_DEFS) {
    if (!agents[def.id]) {
      const agent: AgentConfig = {
        id: def.id,
        name: def.name,
        description: def.description,
        icon: def.icon,
        category: def.category,
        soul: def.soul,
        tools: def.tools,
        maxTurns: def.maxTurns ?? 50,
        model: def.model,
        provider: def.provider,
        temperature: def.temperature,
        systemPrompt: def.systemPrompt,
        tags: def.tags,
        builtin: true,
        createdAt: now(),
        updatedAt: now(),
      };
      // The assistant agent also uses system-wide soul/user/memory files
      if (def.id === 'assistant') {
        agent.soulFile = PATHS.soulFile;
        agent.userFile = PATHS.userFile;
        agent.memoryFile = PATHS.memoryFile;
      }
      agents[def.id] = agent;
    } else {
      agents[def.id].builtin = true;
    }
  }
}

/**
 * Ensure the default agent and all built-in agents exist in config.
 * Returns the config with guaranteed agent entries.
 */
export function ensureDefaultAgent(config: CortexConfig): CortexConfig {
  if (!config.agents) config.agents = {};
  // Migrate old defaultAgent IDs
  if (!config.defaultAgent || config.defaultAgent === 'default') {
    config.defaultAgent = 'assistant';
  }

  // Create assistant as fallback if it doesn't exist in built-in defs
  if (!config.agents['assistant']) {
    config.agents['assistant'] = {
      id: 'assistant',
      name: config.agent?.name || 'Cortex',
      description: 'Default general-purpose assistant agent',
      icon: '🤖',
      category: 'assistant',
      soul: DEFAULT_SOUL,
      soulFile: PATHS.soulFile,
      userFile: PATHS.userFile,
      memoryFile: PATHS.memoryFile,
      maxTurns: config.agent?.maxTurns || 50,
      tools: [],
      builtin: true,
      tags: ['builtin', 'general'],
      createdAt: now(),
      updatedAt: now(),
    };
  }

  ensureBuiltinAgents(config.agents);

  return config;
}
