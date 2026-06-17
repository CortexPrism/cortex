import { checkPolicy, type PolicyDecision } from './policy.ts';
import { logEvent } from '../db/lens.ts';
import {
  isCommandAllowedByTier,
  isPathAllowedByTier,
  isToolAllowedByTier,
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
  'file_copy',
  'file_move',
  'file_list',
  'file_tree',
  'file_info',
  'file_search',
  'file_undo',
  'file_redo',
  'file_glob',
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

  const WEB_TOOLS = new Set(['web_search', 'web_fetch', 'firecrawl', 'web_search_enhanced', 'web_fetch_enhanced', 'brave_search', 'tavily_search', 'serpapi_search']);
  if (WEB_TOOLS.has(toolName)) {
    let url = '';
    if (toolName === 'web_search' || toolName === 'web_search_enhanced' || toolName === 'brave_search' || toolName === 'tavily_search' || toolName === 'serpapi_search') {
      url = String(args.query ?? '');
    } else if (toolName === 'web_fetch' || toolName === 'web_fetch_enhanced' || toolName === 'firecrawl') {
      url = String(args.url ?? args.query ?? '');
    }
    const domainMatch = url.match(/https?:\/\/([^/\s]+)/);
    if (domainMatch) {
      const domainDecision = await checkPolicy('domain', domainMatch[1]);
      if (!domainDecision.allowed) {
        return { allowed: false, reason: domainDecision.reason };
      }
    } else if (url.startsWith('http://') || url.startsWith('https://')) {
      const domainOnly = new URL(url).hostname;
      const domainDecision = await checkPolicy('domain', domainOnly);
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

  // Computer use validation
  if (toolName === 'computer') {
    const action = String(args.action ?? '');
    const computerDecision = await checkPolicy('computer', action);

    if (!computerDecision.allowed) {
      await logEvent({
        event_type: 'policy_check',
        session_id: sessionId,
        actor: 'validator',
        action: `computer:${action}`,
        summary: `Computer use action denied by policy: ${action}`,
        started_at: new Date().toISOString(),
        payload: { action, rule: computerDecision.rule?.id },
      });
      return { allowed: false, reason: computerDecision.reason };
    }

    // Additional validation for typing actions - check for sensitive data
    if (action === 'type') {
      const text = String(args.text ?? '');
      // Simple heuristic to detect potential passwords/secrets
      if (
        text.toLowerCase().includes('password') ||
        text.toLowerCase().includes('secret') ||
        text.toLowerCase().includes('api_key') ||
        text.toLowerCase().includes('apikey') ||
        text.toLowerCase().includes('token') ||
        /\b[A-Za-z0-9_-]{20,}\b/.test(text) // Long random strings
      ) {
        await logEvent({
          event_type: 'policy_check',
          session_id: sessionId,
          actor: 'validator',
          action: 'computer:type:sensitive',
          summary: 'Blocked computer use typing of potentially sensitive data',
          started_at: new Date().toISOString(),
          payload: { action: 'type', blocked: true },
        });
        return {
          allowed: false,
          reason:
            'Blocked typing of potentially sensitive data. Use clipboard or file operations instead.',
        };
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

  // Layer 2.5: Web domain policy checks for node directives
  const WEB_TOOLS_NODE = new Set(['web_search', 'web_fetch', 'firecrawl', 'web_search_enhanced', 'web_fetch_enhanced', 'brave_search', 'tavily_search', 'serpapi_search']);
  if (WEB_TOOLS_NODE.has(toolName)) {
    let url = '';
    if (toolName === 'web_search' || toolName === 'web_search_enhanced' || toolName === 'brave_search' || toolName === 'tavily_search' || toolName === 'serpapi_search') {
      url = String(args.query ?? '');
    } else {
      url = String(args.url ?? args.query ?? '');
    }
    const domainMatch = url.match(/https?:\/\/([^/\s]+)/);
    if (domainMatch) {
      const domainDecision = await checkPolicy('domain', domainMatch[1]);
      if (!domainDecision.allowed) {
        return { allowed: false, reason: domainDecision.reason };
      }
    } else if (url.startsWith('http://') || url.startsWith('https://')) {
      const domainOnly = new URL(url).hostname;
      const domainDecision = await checkPolicy('domain', domainOnly);
      if (!domainDecision.allowed) {
        return { allowed: false, reason: domainDecision.reason };
      }
    }
  }

  // Layer 3: Tier-based path restrictions (for file tools)
  const FILE_TOOLS_NODE = new Set([
    'file_read',
    'file_write',
    'file_edit',
    'file_patch',
    'file_delete',
    'file_rename',
    'file_copy',
    'file_move',
    'file_list',
    'file_tree',
    'file_info',
    'file_search',
    'file_undo',
    'file_redo',
    'file_glob',
  ]);
  if (FILE_TOOLS_NODE.has(toolName)) {
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
