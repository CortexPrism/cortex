import { checkPolicy, type PolicyDecision } from './policy.ts';
import { logEvent } from '../db/lens.ts';

export interface ValidationResult {
  allowed: boolean;
  reason: string;
}

const FILE_TOOLS = new Set([
  'file_read', 'file_write', 'file_edit', 'file_patch',
  'file_delete', 'file_rename', 'file_list', 'file_tree',
  'file_info', 'file_search',
]);

export async function validateToolCall(
  toolName: string,
  args: Record<string, unknown>,
  sessionId: string,
): Promise<ValidationResult> {
  const decision = await checkPolicy('tool', toolName);

  await logEvent({
    event_type: 'policy_check',
    session_id: sessionId,
    actor: 'validator',
    action: `tool:${toolName}`,
    summary: `Tool call ${decision.allowed ? 'allowed' : 'denied'}: ${toolName}`,
    started_at: new Date().toISOString(),
    payload: { tool: toolName, args, decision: decision.rule?.id ?? 'default' },
  });

  if (!decision.allowed) {
    return { allowed: false, reason: decision.reason };
  }

  if (toolName === 'shell' || toolName === 'code_exec') {
    const command = String(args.command ?? args.code ?? '');
    const shellDecision = await checkPolicy('shell', command);

    if (!shellDecision.allowed) {
      await logEvent({
        event_type: 'policy_check',
        session_id: sessionId,
        actor: 'validator',
        action: `shell:${toolName}`,
        summary: `Shell command denied by policy`,
        started_at: new Date().toISOString(),
        payload: { command: command.slice(0, 200), rule: shellDecision.rule?.id },
      });
      return { allowed: false, reason: shellDecision.reason };
    }
  }

  if (toolName === 'web_search') {
    const query = String(args.query ?? '');
    const domainMatch = query.match(/https?:\/\/([^/\s]+)/);
    if (domainMatch) {
      const domainDecision = await checkPolicy('domain', domainMatch[1]);
      if (!domainDecision.allowed) {
        return { allowed: false, reason: domainDecision.reason };
      }
    }
  }

  // Path-based policy check for file tools
  if (FILE_TOOLS.has(toolName)) {
    const pathArg = args.path ?? args.source ?? args.pattern ?? '';
    if (typeof pathArg === 'string' && pathArg) {
      const pathDecision = await checkPolicy('path', pathArg);
      if (!pathDecision.allowed) {
        await logEvent({
          event_type: 'policy_check',
          session_id: sessionId,
          actor: 'validator',
          action: `path:${toolName}`,
          summary: `Path denied by policy: ${pathArg.slice(0, 200)}`,
          started_at: new Date().toISOString(),
          payload: { tool: toolName, path: pathArg.slice(0, 200), rule: pathDecision.rule?.id },
        });
        return { allowed: false, reason: pathDecision.reason };
      }
    }
  }

  return { allowed: true, reason: 'Passed all policy checks' };
}

export async function validateShellCommand(
  command: string,
  sessionId: string,
): Promise<ValidationResult> {
  const decision: PolicyDecision = await checkPolicy('shell', command);

  await logEvent({
    event_type: 'policy_check',
    session_id: sessionId,
    actor: 'validator',
    action: 'shell',
    summary: `Shell command ${decision.allowed ? 'allowed' : 'denied'}`,
    started_at: new Date().toISOString(),
    payload: { command: command.slice(0, 200), rule: decision.rule?.id ?? 'default' },
  });

  return { allowed: decision.allowed, reason: decision.reason };
}
