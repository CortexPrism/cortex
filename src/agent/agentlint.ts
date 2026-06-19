/**
 * AgentLint: Agent Compatibility Auditor — #312
 *
 * Runs automated checks on Cortex agent configurations, plugin manifests,
 * tool descriptions, and system prompts to ensure compatibility, security,
 * and efficiency. Catches issues like ambiguous tool descriptions,
 * excessive tool scoping, and missing error-handling paths.
 */
import type { ToolDefinition } from '../tools/types.ts';
import type { PluginManifest } from '../plugins/types.ts';

export type LintSeverity = 'error' | 'warning' | 'info';

export interface LintIssue {
  id: string;
  severity: LintSeverity;
  category: string;
  message: string;
  source: string;
  suggestion?: string;
}

export interface LintReport {
  issues: LintIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  passCount: number;
  totalChecks: number;
  passed: boolean;
}

export interface AgentConfig {
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[];
  maxTurns: number;
  provider: string;
  model: string;
  temperature?: number;
}

export function lintAgentConfig(config: AgentConfig): LintReport {
  const issues: LintIssue[] = [];
  let checksRun = 0;
  let passed = 0;

  checksRun++; if (checkNameNotEmpty(config)) { passed++; } else { issues.push(createIssue('error', 'naming', 'Agent name is empty', 'agent.name', 'Provide a descriptive name')); }
  checksRun++; if (checkNameLength(config)) { passed++; } else { issues.push(createIssue('warning', 'naming', 'Agent name is very short (<3 chars)', 'agent.name', 'Use a more descriptive name')); }
  checksRun++; if (checkDescriptionNotEmpty(config)) { passed++; } else { issues.push(createIssue('warning', 'documentation', 'Agent has no description', 'agent.description', 'Add a description explaining the agent\'s purpose')); }
  checksRun++; if (checkSystemPromptNotEmpty(config)) { passed++; } else { issues.push(createIssue('error', 'configuration', 'System prompt is empty', 'agent.systemPrompt', 'A system prompt is required for agent behavior')); }
  checksRun++; if (checkSystemPromptLenght(config)) { passed++; } else { issues.push(createIssue('warning', 'performance', `System prompt is very long (${config.systemPrompt.length} chars)`, 'agent.systemPrompt', 'Consider shortening for token efficiency')); }
  checksRun++; if (checkToolsNotEmpty(config)) { passed++; } else { issues.push(createIssue('warning', 'capability', 'No tools configured — agent cannot perform actions', 'agent.tools', 'Add at least one tool for agent utility')); }
  checksRun++; if (checkMaxTurnsReasonable(config)) { passed++; } else { issues.push(createIssue('warning', 'configuration', `maxTurns (${config.maxTurns}) may be too high or too low`, 'agent.maxTurns', 'Recommended range: 5-20')); }
  checksRun++; if (checkProviderValid(config)) { passed++; } else { issues.push(createIssue('error', 'configuration', `Unknown provider: ${config.provider}`, 'agent.provider', 'Use a valid provider: openai, anthropic, google, ollama, bedrock')); }

  const dangerousTools = config.tools.filter((t) => t.includes('shell') || t.includes('exec') || t.includes('delete') || t.includes('computer'));
  checksRun++; if (dangerousTools.length === 0 || config.maxTurns < 20) { passed++; } else { issues.push(createIssue('warning', 'security', `${dangerousTools.length} dangerous tool(s) enabled with high maxTurns: ${dangerousTools.join(', ')}`, 'agent.tools', 'Consider reducing maxTurns or adding policy rules for dangerous tools')); }

  return buildReport(issues, checksRun, passed);
}

export function lintToolDefinition(tool: ToolDefinition): LintReport {
  const issues: LintIssue[] = [];
  let checksRun = 0;
  let passed = 0;

  checksRun++; if (tool.name.length > 0) { passed++; } else { issues.push(createIssue('error', 'naming', 'Tool has no name', tool.name, 'Provide a descriptive name')); }
  checksRun++; if (tool.name.length < 50) { passed++; } else { issues.push(createIssue('warning', 'naming', `Tool name is very long (${tool.name.length} chars)`, tool.name, 'Keep tool names concise for LLM comprehension')); }
  checksRun++; if (tool.description.length > 10) { passed++; } else { issues.push(createIssue('error', 'documentation', 'Tool description too short or missing', tool.name, 'Provide a clear description of what the tool does')); }
  checksRun++; if (tool.description.length < 500) { passed++; } else { issues.push(createIssue('info', 'documentation', `Tool description is very long (${tool.description.length} chars)`, tool.name, 'Consider a more concise description')); }
  checksRun++; if (hasActionVerbs(tool.description)) { passed++; } else { issues.push(createIssue('warning', 'documentation', 'Description lacks clear action verbs', tool.name, 'Start description with an action verb (e.g., "Reads", "Searches", "Executes")')); }
  checksRun++; if (!hasAmbiguousPhrasing(tool.description)) { passed++; } else { issues.push(createIssue('warning', 'documentation', 'Description contains ambiguous phrasing', tool.name, 'Use specific, unambiguous language to prevent LLM tool-selection errors')); }
  checksRun++; if (tool.params.length > 0) { passed++; } else { issues.push(createIssue('info', 'capability', 'Tool has no parameters', tool.name, 'Is this intentional? Consider if the tool needs inputs')); }
  checksRun++; if (tool.params.length <= 10) { passed++; } else { issues.push(createIssue('warning', 'usability', `Tool has ${tool.params.length} parameters — LLM may struggle`, tool.name, 'Consider splitting into multiple focused tools')); }
  checksRun++; if (allParamsHaveDescriptions(tool)) { passed++; } else { issues.push(createIssue('error', 'documentation', 'Some parameters lack descriptions', tool.name, 'Every parameter needs a description for LLM comprehension')); }
  checksRun++; if (tool.capabilities.length > 0) { passed++; } else { issues.push(createIssue('info', 'security', 'Tool declares no capabilities', tool.name, 'Declare required capabilities for permission control')); }

  return buildReport(issues, checksRun, passed);
}

export function lintPluginManifest(manifest: PluginManifest): LintReport {
  const issues: LintIssue[] = [];
  let checksRun = 0;
  let passed = 0;

  checksRun++; if (manifest.name.length > 0) { passed++; } else { issues.push(createIssue('error', 'naming', 'Plugin has no name', 'manifest', 'Provide a plugin name')); }
  checksRun++; if (manifest.version.length > 0) { passed++; } else { issues.push(createIssue('error', 'versioning', 'Plugin has no version', 'manifest', 'Specify a version number')); }
  checksRun++; if (manifest.description.length > 10) { passed++; } else { issues.push(createIssue('warning', 'documentation', 'Plugin description too short', 'manifest', 'Add a descriptive summary')); }
  checksRun++; if (manifest.capabilities.length > 0) { passed++; } else { issues.push(createIssue('warning', 'security', 'Plugin declares no capabilities', 'manifest', 'Explicitly declare required capabilities')); }
  checksRun++; if (!hasExcessiveCapabilities(manifest)) { passed++; } else { issues.push(createIssue('warning', 'security', 'Plugin requests broad capabilities (fs:write + shell:run + network:fetch)', 'manifest', 'Request only necessary capabilities (principle of least privilege)')); }
  checksRun++; if (manifest.kind !== 'wasm') { passed++; } else { issues.push(createIssue('info', 'performance', 'WASM plugins have limited host API access', 'manifest', 'Ensure required host functions are available')); }

  if (manifest.tools) {
    for (const tool of manifest.tools) {
      if (tool.name && (!tool.description || tool.description.length < 10)) {
        issues.push(createIssue('warning', 'documentation', `Plugin tool "${tool.name}" has insufficient description`, `plugin.tools.${tool.name}`, 'Add a clear description for LLM comprehension'));
      }
    }
  }

  return buildReport(issues, checksRun, passed);
}

export function lintSystemPrompt(prompt: string): LintReport {
  const issues: LintIssue[] = [];
  let checksRun = 0;
  let passed = 0;

  checksRun++; if (prompt.length > 0) { passed++; } else { issues.push(createIssue('error', 'configuration', 'System prompt is empty', 'system-prompt', 'Provide a system prompt')); }
  checksRun++; if (prompt.length < 20000) { passed++; } else { issues.push(createIssue('warning', 'performance', `System prompt is very long (${prompt.length} chars)`, 'system-prompt', 'Consider reducing length for token efficiency')); }
  checksRun++; if (hasClearInstructions(prompt)) { passed++; } else { issues.push(createIssue('warning', 'clarity', 'System prompt lacks clear instruction markers', 'system-prompt', 'Use imperative language or numbered instructions')); }
  checksRun++; if (!hasConflictingInstructions(prompt)) { passed++; } else { issues.push(createIssue('warning', 'clarity', 'System prompt may contain conflicting instructions', 'system-prompt', 'Review for contradictory directives')); }

  return buildReport(issues, checksRun, passed);
}

function checkNameNotEmpty(c: AgentConfig): boolean { return c.name.length > 0; }
function checkNameLength(c: AgentConfig): boolean { return c.name.length >= 3; }
function checkDescriptionNotEmpty(c: AgentConfig): boolean { return c.description.length > 0; }
function checkSystemPromptNotEmpty(c: AgentConfig): boolean { return c.systemPrompt.length > 0; }
function checkSystemPromptLenght(c: AgentConfig): boolean { return c.systemPrompt.length < 10000; }
function checkToolsNotEmpty(c: AgentConfig): boolean { return c.tools.length > 0; }
function checkMaxTurnsReasonable(c: AgentConfig): boolean { return c.maxTurns >= 3 && c.maxTurns <= 30; }
function checkProviderValid(c: AgentConfig): boolean {
  const valid = ['openai', 'anthropic', 'google', 'ollama', 'bedrock', 'groq', 'deepseek', 'mistral', 'lmstudio', 'litellm', 'openrouter'];
  return valid.includes(c.provider.toLowerCase());
}

function hasActionVerbs(description: string): boolean {
  return /\b(?:reads?|writes?|searches?|fetches?|executes?|runs?|creates?|deletes?|updates?|lists?|finds?|analyzes?)\b/i.test(description);
}

function hasAmbiguousPhrasing(description: string): boolean {
  return /\b(?:maybe|perhaps|sometimes|possibly|try|attempt|could|might)\b/i.test(description);
}

function allParamsHaveDescriptions(tool: ToolDefinition): boolean {
  return tool.params.every((p) => p.description.length > 0);
}

function hasExcessiveCapabilities(manifest: PluginManifest): boolean {
  const caps = manifest.capabilities;
  return caps.includes('fs:write') && caps.includes('shell:run') && caps.includes('network:fetch');
}

function hasClearInstructions(prompt: string): boolean {
  return /\b(?:you are|your role|your task|instructions?|guidelines?|rules?)\b/i.test(prompt);
}

function hasConflictingInstructions(prompt: string): boolean {
  const conflicts = [
    [/\balways\b/i, /\bnever\b/i],
    [/\bmust\b/i, /\boptional\b/i],
    [/\brequired\b/i, /\boptional\b/i],
  ];
  return conflicts.some(
    ([a, b]) => a.test(prompt) && b.test(prompt),
  );
}

function createIssue(
  severity: LintSeverity,
  category: string,
  message: string,
  source: string,
  suggestion?: string,
): LintIssue {
  return {
    id: `lint_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    severity,
    category,
    message,
    source,
    suggestion,
  };
}

function buildReport(
  issues: LintIssue[],
  checksRun: number,
  passed: number,
): LintReport {
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const infoCount = issues.filter((i) => i.severity === 'info').length;

  return {
    issues,
    errorCount,
    warningCount,
    infoCount,
    passCount: passed,
    totalChecks: checksRun,
    passed: errorCount === 0,
  };
}
