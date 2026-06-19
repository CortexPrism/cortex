/**
 * A2A Agent Card Generator — Builds Agent Cards for Cortex agents.
 */
import type { AgentCard, AgentSkill, AgentInterface } from './types.ts';
import type { Tool } from '../tools/types.ts';

export function generateAgentCard(
  baseUrl: string,
  agentName: string,
  agentDescription: string,
  tools: Tool[],
): AgentCard {
  const skills = convertToolsToSkills(tools);

  return {
    name: agentName,
    description: agentDescription || 'CortexPrism AI Agent',
    url: baseUrl,
    version: '1.0',
    defaultInputModes: ['text'],
    defaultOutputModes: ['text'],
    capabilities: {
      streaming: true,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    skills: skills.length > 0 ? skills : getDefaultSkills(),
    interfaces: [
      { url: `${baseUrl}/a2a`, protocol: 'json-rpc', version: '1.0' },
    ],
    documentationUrl: `${baseUrl}/docs`,
  };
}

function convertToolsToSkills(tools: Tool[]): AgentSkill[] {
  return tools.map((tool) => ({
    id: tool.definition.name,
    name: tool.definition.name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    description: tool.definition.description,
    tags: tool.definition.capabilities,
    inputModes: ['text'],
    outputModes: ['text'],
    examples: generateToolExamples(tool.definition.name, tool.definition.description),
  }));
}

function generateToolExamples(toolName: string, _description: string): string[] {
  const examples: Record<string, string[]> = {
    file_read: ['Read the contents of src/main.ts', 'Show me the config file'],
    file_write: ['Write a new component file', 'Create a test file'],
    file_edit: ['Rename this function', 'Update the import paths'],
    shell: ['Run npm install', 'Execute the test suite'],
    code_exec: ['Write a Python script that sorts a list', 'Generate a SQL query'],
    web_search: ['Search for the latest React documentation', 'Find best practices for error handling'],
    web_fetch: ['Fetch the content from this documentation page', 'Get the API reference'],
    sub_agent: ['Delegate research task to a specialized agent', 'Spawn agent for parallel work'],
    github_pr_create: ['Create a PR for this branch', 'Open a pull request with the changes'],
    db_query: ['Query the users table', 'Check recent orders'],
  };

  return examples[toolName] ?? [
    `Use ${toolName} to accomplish a relevant task`,
  ];
}

function getDefaultSkills(): AgentSkill[] {
  return [
    {
      id: 'coding',
      name: 'Coding',
      description: 'Write, edit, and refactor code in many languages',
      tags: ['coding', 'development'],
      examples: ['Write a REST API', 'Refactor this module'],
    },
    {
      id: 'debugging',
      name: 'Debugging',
      description: 'Diagnose and fix bugs',
      tags: ['debugging'],
      examples: ['Why does this test fail?', 'Find the null pointer'],
    },
  ];
}
