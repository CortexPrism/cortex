import type { ToolCallRequest, ToolCallResult, ToolContext } from './types.ts';
import type { ToolRegistry } from './registry.ts';
import { logEvent } from '../db/lens.ts';
import { validateToolCall } from '../security/validator.ts';

const TOOL_CALL_RE = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g;

const MAX_OUTPUT_LENGTH = 8_000;

export function parseToolCalls(text: string): ToolCallRequest[] {
  const calls: ToolCallRequest[] = [];
  let match: RegExpExecArray | null;
  TOOL_CALL_RE.lastIndex = 0;

  while ((match = TOOL_CALL_RE.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]) as {
        tool?: string;
        name?: string;
        args?: Record<string, unknown>;
        arguments?: Record<string, unknown>;
      };
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
      errorInfo: {
        code: 'UNKNOWN_TOOL',
        message: `Tool "${request.toolName}" is not registered`,
        retryable: false,
        suggestedAction: `Available tools: ${[...registry.toolNames()].join(', ')}`,
      },
      durationMs: 0,
    };
  }

  const validation = await validateToolCall(
    request.toolName,
    request.args,
    context.sessionId,
  ).catch((err) => {
    console.error(
      `[executor] Validator unavailable for ${request.toolName}: ${(err as Error).message}`,
    );
    return { allowed: false, reason: `Validator unavailable: ${(err as Error).message}` };
  });

  if (!validation.allowed) {
    return {
      toolName: request.toolName,
      success: false,
      output: '',
      error: `Blocked by policy: ${validation.reason}`,
      errorInfo: {
        code: 'POLICY_DENIED',
        message: validation.reason,
        retryable: true,
        suggestedAction: 'Remove the blocked operation or request a policy exception.',
      },
      durationMs: 0,
    };
  }

  const toolResult = await tool.execute(request.args, context);

  const result: ToolCallResult = {
    ...toolResult,
    errorInfo: toolResult.error && !toolResult.errorInfo
      ? {
        code: 'TOOL_ERROR',
        message: toolResult.error,
        retryable: true,
        suggestedAction: 'Check the tool parameters and retry.',
      }
      : toolResult.errorInfo,
    truncated: toolResult.output.length > MAX_OUTPUT_LENGTH,
    outputLength: toolResult.output.length,
  };

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

  return result;
}

export function formatToolResults(results: ToolCallResult[]): string {
  return results
    .map((r) => {
      const status = r.success ? 'OK' : 'ERROR';
      const fullBody = r.success ? r.output : (r.error ?? 'unknown error');
      const shouldTruncate = fullBody.length > MAX_OUTPUT_LENGTH;
      let body = shouldTruncate
        ? fullBody.slice(0, MAX_OUTPUT_LENGTH) +
          `\n... [truncated ${
            fullBody.length - MAX_OUTPUT_LENGTH
          } bytes — full output available via tool_output_read]`
        : fullBody;
      let attrs = `tool="${r.toolName}" status="${status}"`;
      if (r.errorInfo) {
        attrs += ` error_code="${r.errorInfo.code}" retryable="${r.errorInfo.retryable}"`;
        if (r.errorInfo.suggestedAction) {
          body += `\n[Suggested: ${r.errorInfo.suggestedAction}]`;
        }
      }
      return `<tool_result ${attrs}>\n${body}\n</tool_result>`;
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
          (p) => `  - ${p.name} (${p.type}${p.required ? ', required' : ''}): ${p.description}`,
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
