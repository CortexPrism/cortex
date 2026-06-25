import { checkPolicy, type PolicyDecision } from './policy.ts';
import { logEvent } from '../../../../src/db/lens.ts';
import {
  isCommandAllowedByTier,
  isPathAllowedByTier,
  isToolAllowedByTier,
} from '../../../../src/hub/capability-tiers.ts';
import type { NodeTier } from '../../../../src/hub/node-registry.ts';
import { resolveAndCheck } from './ssrf.ts';
import { isPathAllowed } from './isolation.ts';

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
    const wsArg = args.workspace;
    if (wsArg === 'global' || wsArg === 'agent') {
      const wsDecision = await checkPolicy('workspace', String(wsArg));
      if (!wsDecision.allowed) {
        await logEvent({
          event_type: 'policy_check',
          session_id: sessionId,
          actor: 'validator',
          action: `workspace:${toolName}`,
          summary: `Workspace access denied: ${wsArg}`,
          started_at: new Date().toISOString(),
          payload: { tool: toolName, workspace: wsArg, rule: wsDecision.rule?.id },
        });
        return { allowed: false, reason: wsDecision.reason };
      }
    }

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

    const urlPattern = /https?:\/\/[^\s"'`;|&<>]+/gi;
    const urls = command.match(urlPattern);
    if (urls) {
      for (const url of urls) {
        const ssrfCheck = await resolveAndCheck(url);
        if (!ssrfCheck.valid) {
          await logEvent({
            event_type: 'policy_check',
            session_id: sessionId,
            actor: 'validator',
            action: `shell:ssrf:${toolName}`,
            summary: `Shell SSRF blocked: ${ssrfCheck.error}`,
            started_at: new Date().toISOString(),
            payload: { url: url.slice(0, 200), error: ssrfCheck.error },
          });
          return { allowed: false, reason: `SSRF protection: ${ssrfCheck.error}` };
        }
      }
    }
  }

  const WEB_TOOLS = new Set([
    'web_search',
    'web_fetch',
    'firecrawl',
    'web_search_enhanced',
    'web_fetch_enhanced',
    'brave_search',
    'tavily_search',
    'serpapi_search',
  ]);
  if (WEB_TOOLS.has(toolName)) {
    let url = '';
    if (
      toolName === 'web_search' || toolName === 'web_search_enhanced' ||
      toolName === 'brave_search' || toolName === 'tavily_search' || toolName === 'serpapi_search'
    ) {
      url = String(args.query ?? '');
    } else if (
      toolName === 'web_fetch' || toolName === 'web_fetch_enhanced' || toolName === 'firecrawl'
    ) {
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

  // Workspace policy check for file tools with workspace parameter
  if (FILE_TOOLS.has(toolName)) {
    const workspaceArg = args.workspace;
    if (workspaceArg === 'global' || workspaceArg === 'agent') {
      const wsValue = String(workspaceArg);
      const wsDecision = await checkPolicy('workspace', wsValue);
      if (!wsDecision.allowed) {
        await logEvent({
          event_type: 'policy_check',
          session_id: sessionId,
          actor: 'validator',
          action: `workspace:${toolName}`,
          summary: `Workspace access denied: ${wsValue}`,
          started_at: new Date().toISOString(),
          payload: { tool: toolName, workspace: wsValue, rule: wsDecision.rule?.id },
        });
        return { allowed: false, reason: wsDecision.reason };
      }
    }

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

      if (!isPathAllowed(sessionId, pathArg)) {
        await logEvent({
          event_type: 'policy_check',
          session_id: sessionId,
          actor: 'validator',
          action: `isolation:${toolName}`,
          summary: `Path outside session boundary: ${pathArg.slice(0, 200)}`,
          started_at: new Date().toISOString(),
          payload: { tool: toolName, path: pathArg.slice(0, 200) },
        });
        return {
          allowed: false,
          reason: `Path "${pathArg.slice(0, 100)}" outside session isolation boundary`,
        };
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

  // Chrome Bridge security validation
  if (toolName.startsWith('chrome_')) {
    // chrome_execute_js: high-risk arbitrary JS execution — require explicit tool policy allow
    if (toolName === 'chrome_execute_js') {
      const script = String(args.script ?? '');
      if (script) {
        const executeJsDecision = await checkPolicy('tool', 'chrome_execute_js');
        if (!executeJsDecision.allowed) {
          await logEvent({
            event_type: 'policy_check',
            session_id: sessionId,
            actor: 'validator',
            action: 'chrome_bridge:execute_js',
            summary: `chrome_execute_js denied by policy: ${script.slice(0, 100)}`,
            started_at: new Date().toISOString(),
            payload: {
              tool: toolName,
              script: script.slice(0, 200),
              rule: executeJsDecision.rule?.id,
            },
          });
          return { allowed: false, reason: executeJsDecision.reason };
        }
      }
      logEvent({
        event_type: 'policy_check',
        session_id: sessionId,
        actor: 'validator',
        action: 'chrome_bridge:execute_js',
        summary: `chrome_execute_js: ${script.slice(0, 100)}`,
        started_at: new Date().toISOString(),
        payload: { script: script.slice(0, 200) },
      }).catch(() => {});
    }

    // chrome_upload_file: path-based policy with traversal check
    if (toolName === 'chrome_upload_file') {
      const paths = args.paths;
      if (Array.isArray(paths)) {
        for (const rawPath of paths) {
          if (typeof rawPath === 'string') {
            const normalized = rawPath.replace(/\/\.{2,}\//g, '/').replace(/^\.{2,}\//, '');
            if (normalized !== rawPath.replace(/\/\//g, '/') && normalized === '') {
              return { allowed: false, reason: `Path traversal blocked: ${rawPath}` };
            }
            const pathDecision = await checkPolicy('path', normalized);
            if (!pathDecision.allowed) {
              await logEvent({
                event_type: 'policy_check',
                session_id: sessionId,
                actor: 'validator',
                action: 'chrome_bridge:upload_file',
                summary: `Path denied by policy: ${normalized}`,
                started_at: new Date().toISOString(),
                payload: { tool: toolName, path: normalized, rule: pathDecision.rule?.id },
              });
              return { allowed: false, reason: pathDecision.reason };
            }
          }
        }
      }
    }

    // chrome_network_rules: only allow list/clear, modifications require capability policy check
    if (toolName === 'chrome_network_rules') {
      const action = String(args.action ?? 'list');
      if (action !== 'list' && action !== 'clear') {
        const networkRulesDecision = await checkPolicy('capability', 'network_rules_modify');
        if (!networkRulesDecision.allowed) {
          await logEvent({
            event_type: 'policy_check',
            session_id: sessionId,
            actor: 'validator',
            action: 'chrome_bridge:network_rules',
            summary: `Network rule modification denied by policy: ${action}`,
            started_at: new Date().toISOString(),
            payload: { tool: toolName, action, rule: networkRulesDecision.rule?.id },
          });
          return { allowed: false, reason: networkRulesDecision.reason };
        }
      }
    }

    // chrome_save_page / chrome_manage_downloads: path-based policy with traversal check
    if (toolName === 'chrome_save_page' || toolName === 'chrome_manage_downloads') {
      const filePath = String(args.path ?? '');
      if (filePath) {
        const normalized = filePath.replace(/\/\.{2,}\//g, '/').replace(/^\.{2,}\//, '');
        if (normalized !== filePath.replace(/\/\//g, '/') && normalized === '') {
          return { allowed: false, reason: `Path traversal blocked: ${filePath}` };
        }
        const pathDecision = await checkPolicy('path', normalized);
        if (!pathDecision.allowed) {
          return { allowed: false, reason: pathDecision.reason };
        }
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

  if (!decision.allowed) {
    return { allowed: false, reason: decision.reason };
  }

  const urlPattern = /https?:\/\/[^\s"'`;|&<>]+/gi;
  const urls = command.match(urlPattern);
  if (urls) {
    for (const url of urls) {
      const ssrfCheck = await resolveAndCheck(url);
      if (!ssrfCheck.valid) {
        await logEvent({
          event_type: 'policy_check',
          session_id: sessionId,
          actor: 'validator',
          action: 'shell:ssrf',
          summary: `Shell SSRF blocked: ${ssrfCheck.error}`,
          started_at: new Date().toISOString(),
          payload: { url: url.slice(0, 200), error: ssrfCheck.error },
        });
        return { allowed: false, reason: `SSRF protection: ${ssrfCheck.error}` };
      }
    }
  }

  return { allowed: true, reason: 'Passed shell policy and SSRF checks' };
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
  const WEB_TOOLS_NODE = new Set([
    'web_search',
    'web_fetch',
    'firecrawl',
    'web_search_enhanced',
    'web_fetch_enhanced',
    'brave_search',
    'tavily_search',
    'serpapi_search',
  ]);
  if (WEB_TOOLS_NODE.has(toolName)) {
    let url = '';
    if (
      toolName === 'web_search' || toolName === 'web_search_enhanced' ||
      toolName === 'brave_search' || toolName === 'tavily_search' || toolName === 'serpapi_search'
    ) {
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
