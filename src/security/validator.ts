import { checkPolicy, type PolicyDecision } from './policy.ts';
import { logEvent } from '../db/lens.ts';
import {
  isToolAllowedByTier,
  isPathAllowedByTier,
  isCommandAllowedByTier,
} from '../hub/capability-tiers.ts';
import type { NodeTier } from '../hub/node-registry.ts';

export interface ValidationResult {
  allowed: boolean;
  reason: string;
}

const FILE_TOOLS = new Set([
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

export async function validateNodeDirective(
  nodeId: string,
  tier: NodeTier,
  toolName: string,
  args: Record<string, unknown>,
  sessionId: string,
): Promise<ValidationResult> {
  // Layer 1: Tier-based tool allow-list
  if (!isToolAllowedByTier(tier, toolName)) {
    const reason = `Tool "${toolName}" not allowed for tier "${tier}"`;
    await logEvent({
      event_type: 'policy_check',
      session_id: sessionId,
      actor: 'hub',
      action: `node_directive:${toolName}`,
      summary: reason,
      started_at: new Date().toISOString(),
      payload: { nodeId, tier, tool: toolName, args },
    });
    return { allowed: false, reason };
  }

  // Layer 2: Tier-based command restrictions (for shell/code_exec)
  if (toolName === 'shell' || toolName === 'code_exec') {
    const command = String(args.command ?? args.code ?? '');
    if (command) {
      const cmdCheck = isCommandAllowedByTier(tier, command);
      if (!cmdCheck.allowed) {
        await logEvent({
          event_type: 'policy_check',
          session_id: sessionId,
          actor: 'hub',
          action: `node_directive:${toolName}:command`,
          summary: cmdCheck.reason,
          started_at: new Date().toISOString(),
          payload: { nodeId, tier, tool: toolName, command: command.slice(0, 200) },
        });
        return { allowed: false, reason: cmdCheck.reason };
      }
    }
  }

  // Layer 3: Tier-based path restrictions (for file tools)
  const FILE_TOOLS = new Set([
    'file_read', 'file_write', 'file_edit', 'file_patch',
    'file_delete', 'file_rename', 'file_list', 'file_tree',
    'file_info', 'file_search',
  ]);
  if (FILE_TOOLS.has(toolName)) {
    const pathArg = args.path ?? args.source ?? args.pattern ?? '';
    if (typeof pathArg === 'string' && pathArg) {
      const pathCheck = isPathAllowedByTier(tier, pathArg);
      if (!pathCheck.allowed) {
        await logEvent({
          event_type: 'policy_check',
          session_id: sessionId,
          actor: 'hub',
          action: `node_directive:${toolName}:path`,
          summary: pathCheck.reason,
          started_at: new Date().toISOString(),
          payload: { nodeId, tier, tool: toolName, path: pathArg.slice(0, 200) },
        });
        return { allowed: false, reason: pathCheck.reason };
      }
    }
  }

  // Layer 4: Cross-cutting policy rules (policy_rules table)
  const toolDecision = await checkPolicy('tool', toolName, nodeId);
  if (!toolDecision.allowed) {
    await logEvent({
      event_type: 'policy_check',
      session_id: sessionId,
      actor: 'hub',
      action: `node_directive:${toolName}:policy`,
      summary: `Tool blocked by policy: ${toolDecision.reason}`,
      started_at: new Date().toISOString(),
      payload: { nodeId, tier, tool: toolName, rule: toolDecision.rule?.id },
    });
    return { allowed: false, reason: toolDecision.reason };
  }

  if (toolName === 'shell' || toolName === 'code_exec') {
    const command = String(args.command ?? args.code ?? '');
    if (command) {
      const shellDecision = await checkPolicy('shell', command, nodeId);
      if (!shellDecision.allowed) {
        await logEvent({
          event_type: 'policy_check',
          session_id: sessionId,
          actor: 'hub',
          action: `node_directive:${toolName}:shell_policy`,
          summary: `Shell blocked by policy: ${shellDecision.reason}`,
          started_at: new Date().toISOString(),
          payload: { nodeId, tier, command: command.slice(0, 200), rule: shellDecision.rule?.id },
        });
        return { allowed: false, reason: shellDecision.reason };
      }
    }
  }

  return { allowed: true, reason: 'Passed all tier and policy checks' };
}
