import type { ToolCallRequest, ToolCallResult, ToolContext } from './types.ts';
import type { ToolRegistry } from './registry.ts';
import { logEvent } from '../db/lens.ts';
import { validateToolCall } from '../security/validator.ts';

const TOOL_CALL_RE = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g;

export function parseToolCalls(text: string): ToolCallRequest[] {
  const calls: ToolCallRequest[] = [];
  let match: RegExpExecArray | null;
  TOOL_CALL_RE.lastIndex = 0;

  while ((match = TOOL_CALL_RE.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]) as { tool?: string; name?: string; args?: Record<string, unknown>; arguments?: Record<string, unknown> };
      const toolName = parsed.tool ?? parsed.name ?? '';
      const args = parsed.args ?? parsed.arguments ?? {};
      if (toolName) calls.push({ toolName, args });
    } catch {
      // malformed JSON — skip
    }
  }

  return calls;
}

export async function executeTool(
  request: ToolCallRequest,
  registry: ToolRegistry,
  context: ToolContext,
): Promise<ToolCallResult> {
  const tool = registry.get(request.toolName);

  if (!tool) {
    return {
      toolName: request.toolName,
      success: false,
      output: '',
      error: `Unknown tool: ${request.toolName}`,
      durationMs: 0,
    };
  }

  const validation = await validateToolCall(
    request.toolName,
    request.args,
    context.sessionId,
  ).catch(() => ({ allowed: true, reason: 'validator unavailable' }));

  if (!validation.allowed) {
    return {
      toolName: request.toolName,
      success: false,
      output: '',
      error: `Blocked by policy: ${validation.reason}`,
      durationMs: 0,
    };
  }

  const toolResult = await tool.execute(request.args, context);

  await logEvent({
    event_type: 'tool_call',
    session_id: context.sessionId,
    actor: 'tool',
    action: `tool:${request.toolName}`,
    summary: JSON.stringify(request.args).slice(0, 120),
    started_at: new Date().toISOString(),
    duration_ms: toolResult.durationMs,
    error: toolResult.error,
  });

  return toolResult;
}

export function formatToolResults(results: ToolCallResult[]): string {
  return results
    .map((r) => {
      const status = r.success ? 'OK' : 'ERROR';
      const body = r.success ? r.output : (r.error ?? 'unknown error');
      return `<tool_result tool="${r.toolName}" status="${status}">\n${body}\n</tool_result>`;
    })
    .join('\n\n');
}

export function injectToolsIntoPrompt(
  systemPrompt: string,
  toolSchemas: ReturnType<ToolRegistry['definitions']>,
): string {
  if (toolSchemas.length === 0) return systemPrompt;

  const toolDocs = toolSchemas
    .map((t) => {
      const params = t.params
        .map(
          (p) =>
            `  - ${p.name} (${p.type}${p.required ? ', required' : ''}): ${p.description}`,
        )
        .join('\n');
      return `### ${t.name}\n${t.description}\nParameters:\n${params}`;
    })
    .join('\n\n');

  return `${systemPrompt}

---

## Available Tools

To call a tool, emit exactly this XML in your response (no prose before the closing tag):

\`\`\`
<tool_call>{"tool": "<name>", "args": {<json args>}}</tool_call>
\`\`\`

You may call multiple tools sequentially. Wait for results before proceeding.

${toolDocs}`;
}
