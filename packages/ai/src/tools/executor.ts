import { logger } from '../../../../src/utils/logger.ts';
import type { ToolCallRequest, ToolCallResult, ToolContext } from './types.ts';
import type { ToolRegistry } from './registry.ts';
import { logEvent } from '../../../../src/db/lens.ts';
import { validateToolCall } from '../../../../src/security/validator.ts';

const _log = logger('tools:executor');

const TOOL_CALL_BLOCK_RE = /<tool_call>[\s\S]*?<\/tool_call>/g;

function cleanToolArgText(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/[├└│─]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^['"`\s]+|['"`\s]+$/g, '')
    .trim();
}

function parseToolArgsFromXml(raw: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const pairs = [
    ...raw.matchAll(
      /<tool_call_arg_key>([\s\S]*?)<\/tool_call_arg_key>[\s\S]*?<tool_call_arg_value>([\s\S]*?)<\/tool_call_arg_value>/g,
    ),
  ];
  for (const pair of pairs) {
    const key = cleanToolArgText(pair[1]);
    const valText = cleanToolArgText(pair[2]);
    if (!key) continue;
    try {
      args[key] = JSON.parse(valText);
    } catch {
      args[key] = valText;
    }
  }
  if (Object.keys(args).length > 0) return args;

  const paramPairs = [
    ...raw.matchAll(/<parameter\s+name\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/parameter>/g),
  ];
  for (const pair of paramPairs) {
    const key = pair[1].trim();
    const valText = pair[2].trim();
    if (!key) continue;
    try {
      args[key] = JSON.parse(valText);
    } catch {
      args[key] = valText;
    }
  }
  return args;
}

const MAX_OUTPUT_LENGTH = 8_000;

function sanitizeModelJson(raw: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (escaped) {
      escaped = false;
      out += ch;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      out += ch;
      continue;
    }
    if (ch === '"') {
      if (inString) {
        let j = i + 1;
        while (
          j < raw.length &&
          (raw[j] === ' ' || raw[j] === '\t' || raw[j] === '\n' || raw[j] === '\r')
        ) j++;
        if (
          j < raw.length && (raw[j] === ':' || raw[j] === ',' || raw[j] === '}' || raw[j] === ']')
        ) {
          inString = false;
          out += ch;
        } else {
          out += '\\"';
        }
      } else {
        inString = true;
        out += ch;
      }
      continue;
    }
    if (inString) {
      if (ch === '\n') out += '\\n';
      else if (ch === '\r') out += '\\r';
      else if (ch === '\t') out += '\\t';
      else out += ch;
    } else {
      out += ch;
    }
  }
  out = out
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/([{,]\s*)([a-zA-Z_]\w*)(\s*:)/g, '$1"$2"$3');
  return out;
}

function parseToolCallJson(raw: string): ToolCallRequest | null {
  try {
    const parsed = JSON.parse(raw) as {
      tool?: string;
      name?: string;
      args?: Record<string, unknown>;
      arguments?: Record<string, unknown>;
    };
    const toolName = parsed.tool ?? parsed.name ?? '';
    const args = parsed.args ?? parsed.arguments ?? {};
    if (toolName) return { toolName, args };
  } catch {
    try {
      const sanitized = sanitizeModelJson(raw);
      const parsed = JSON.parse(sanitized) as {
        tool?: string;
        name?: string;
        args?: Record<string, unknown>;
        arguments?: Record<string, unknown>;
      };
      const toolName = parsed.tool ?? parsed.name ?? '';
      const args = parsed.args ?? parsed.arguments ?? {};
      if (toolName) return { toolName, args };
    } catch {
      // malformed JSON — skip
    }
  }
  return null;
}

function extractBalancedJson(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseToolCallsFromFragments(text: string): ToolCallRequest[] {
  const calls: ToolCallRequest[] = [];

  // Direct-tool-name-as-tag format: <file_read><path>...</path></file_read>
  const directToolRe =
    /<(file_read_enhanced|file_read|file_write|file_tree|file_list|file_search|file_glob|file_edit|web_search|web_fetch|shell|shell_exec|search|memory_search|memory_write|workspace|execute)\b\s*((?:\s+[a-zA-Z0-9_-]+="[^"]*")*)\s*>([\s\S]*?)<\/\1>/g;
  let dm: RegExpExecArray | null;
  while ((dm = directToolRe.exec(text)) !== null) {
    const toolName = dm[1];
    const body = dm[3];
    const args: Record<string, unknown> = {};
    const paramRe = /<([a-zA-Z0-9_-]+)>\s*([\s\S]*?)\s*<\/\1>/g;
    let pm: RegExpExecArray | null;
    while ((pm = paramRe.exec(body)) !== null) {
      const key = pm[1];
      const val = pm[2].trim();
      try {
        args[key] = JSON.parse(val);
      } catch {
        args[key] = val;
      }
    }
    calls.push({ toolName, args });
  }
  if (calls.length > 0) return calls;

  // <arg_key>/<arg_value> XML format generated by some LLMs (e.g. deepseek-v4)
  // <tool_call>
  //   <arg_key>tool</arg_key>
  //   <arg_value>sub_agent</arg_value>
  //   <arg_key>args</arg_key>
  //   <arg_value>{"type": "plan", ...}</arg_value>
  // </tool_call>
  const argKeyBlocks = [...text.matchAll(
    /<tool_call>\s*((?:<arg_key>[^<]+<\/arg_key>\s*<arg_value>[^<]*<\/arg_value>\s*)+)<\/tool_call>/g,
  )];
  if (argKeyBlocks.length > 0) {
    for (const block of argKeyBlocks) {
      const inner = block[1];
      const pairs = [
        ...inner.matchAll(/<arg_key>([^<]+)<\/arg_key>\s*<arg_value>([^<]*)<\/arg_value>/g),
      ];
      const map = new Map<string, string>();
      for (const [, key, val] of pairs) {
        map.set(key.trim(), val.trim());
      }
      const toolName = map.get('tool') || map.get('name') || '';
      const argsRaw = map.get('args') || '{}';
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(argsRaw) as Record<string, unknown>;
      } catch {
        args = { _raw: argsRaw };
      }
      if (toolName) calls.push({ toolName, args });
    }
    if (calls.length > 0) return calls;
  }

  const nameMatches = [
    ...text.matchAll(/<tool_call_name>([\s\S]*?)<\/tool_call_name>/g),
    ...text.matchAll(/<tool_call>([a-zA-Z0-9_-]+)<\/tool_call>/g),
    ...text.matchAll(/<tool_call_name="([a-zA-Z0-9_-]+)"\s*(?:[^>]*?)?>/g),
  ];
  const argMatches = [...text.matchAll(/<tool_call_args>([\s\S]*?)<\/tool_call_args>/g)];

  if (nameMatches.length === 0) return calls;

  const names = nameMatches.map((m) => m[1].trim()).filter(Boolean);
  const argsBlocks = argMatches.map((m) => m[1].trim());

  if (argsBlocks.length === 0) {
    for (const toolName of names) calls.push({ toolName, args: {} });
    return calls;
  }

  const count = Math.max(names.length, argsBlocks.length);
  for (let i = 0; i < count; i++) {
    const toolName = names[Math.min(i, names.length - 1)];
    const argsRaw = argsBlocks[Math.min(i, argsBlocks.length - 1)];
    if (!toolName) continue;
    try {
      const args = argsRaw ? JSON.parse(argsRaw) as Record<string, unknown> : {};
      calls.push({ toolName, args });
    } catch {
      calls.push({ toolName, args: parseToolArgsFromXml(argsRaw) });
    }
  }
  return calls;
}

function extractBareToolCalls(text: string): ToolCallRequest[] {
  const calls: ToolCallRequest[] = [];
  const regex = /\{\s*"(tool|name)"\s*:/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    let depth = 0;
    let end = start;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end > start) {
      const call = parseToolCallJson(text.slice(start, end));
      if (call) calls.push(call);
    }
  }

  return calls;
}

export function parseToolCalls(text: string): ToolCallRequest[] {
  const calls: ToolCallRequest[] = [];

  const fragmentCalls = parseToolCallsFromFragments(text);
  if (fragmentCalls.length > 0) {
    calls.push(...fragmentCalls);
  }

  let match: RegExpExecArray | null;
  TOOL_CALL_BLOCK_RE.lastIndex = 0;
  while ((match = TOOL_CALL_BLOCK_RE.exec(text)) !== null) {
    const block = match[0];
    const jsonRaw = extractBalancedJson(block);
    if (jsonRaw) {
      const call = parseToolCallJson(jsonRaw);
      if (call) calls.push(call);
    }
  }

  // Strip <tool_call> regions and fenced code blocks before bare-JSON scan
  // to avoid double-counting, but first extract calls from code fences
  const fenceRe = /```(?:json|tool_call)?\n([\s\S]*?)```/g;
  let fm: RegExpExecArray | null;
  while ((fm = fenceRe.exec(text)) !== null) {
    const inner = fm[1].trim();
    if (/^\{/.test(inner)) {
      const call = parseToolCallJson(inner);
      if (call) calls.push(call);
    }
  }

  const strippedText = text
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
    .replace(/```(?:json|tool_call)?\n[\s\S]*?```/g, '');
  calls.push(...extractBareToolCalls(strippedText));

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
    _log.error(`Validator unavailable for ${request.toolName}`, { error: (err as Error).message });
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
    payload: {
      toolName: request.toolName,
      success: toolResult.success,
      output: toolResult.success ? toolResult.output.slice(0, 500) : undefined,
      error: toolResult.error,
      durationMs: toolResult.durationMs,
    },
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
      if (r.durationMs != null) attrs += ` duration_ms="${r.durationMs}"`;
      if (r.truncated) attrs += ` truncated="true"`;
      if (r.outputLength != null) attrs += ` output_length="${r.outputLength}"`;
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
