/**
 * Dynamic Tool Permission Grant — #62
 *
 * Per-task tool permission evaluation. Instead of static allow/deny at
 * install time, the agent requests tools dynamically and the policy engine
 * evaluates against task scope, risk level, and session context.
 *
 * Unified with #135 (Runtime Policy Enforcer) and #254 (Tool Approval Workflow).
 */
import { checkPolicy, type PolicyDecision, type PolicyKind, type PolicyRule } from './policy.ts';
import { logEvent } from '../../../../src/db/lens.ts';
import { hasTemporaryGrant } from './approval.ts';
import { assessRiskLevel } from '../../../../src/mcp-gateway/gateway.ts';

export type GrantDecision = 'granted' | 'granted_with_guardrails' | 'denied' | 'requires_approval';

export interface DynamicGrantResult {
  decision: GrantDecision;
  reason: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  guardrails?: GuardrailSet;
  policyRule?: PolicyRule | null;
  approvalRequired: boolean;
}

export interface GuardrailSet {
  readOnly?: boolean;
  restrictedPaths?: string[];
  allowedDomains?: string[];
  maxDurationMs?: number;
  maxTokens?: number;
  requireConfirmation?: boolean;
}

export interface TaskScope {
  taskId: string;
  sessionId: string;
  agentId: string;
  description: string;
  requiredCapabilities: string[];
}

const TOOL_RISK_PROFILES: Record<
  string,
  { baseRisk: 'low' | 'medium' | 'high' | 'critical'; defaultGuardrails: GuardrailSet }
> = {
  file_read: { baseRisk: 'low', defaultGuardrails: { readOnly: true } },
  file_write: {
    baseRisk: 'medium',
    defaultGuardrails: { restrictedPaths: [], requireConfirmation: true },
  },
  file_edit: {
    baseRisk: 'medium',
    defaultGuardrails: { restrictedPaths: [], requireConfirmation: true },
  },
  file_delete: {
    baseRisk: 'high',
    defaultGuardrails: { restrictedPaths: [], requireConfirmation: true },
  },
  file_patch: {
    baseRisk: 'medium',
    defaultGuardrails: { restrictedPaths: [], requireConfirmation: true },
  },
  shell: { baseRisk: 'high', defaultGuardrails: { maxDurationMs: 30_000 } },
  code_exec: { baseRisk: 'medium', defaultGuardrails: { maxDurationMs: 30_000, maxTokens: 10000 } },
  web_search: { baseRisk: 'low', defaultGuardrails: { allowedDomains: [] } },
  web_fetch: { baseRisk: 'medium', defaultGuardrails: { allowedDomains: [] } },
  db_query: { baseRisk: 'medium', defaultGuardrails: { readOnly: true } },
  sub_agent: { baseRisk: 'medium', defaultGuardrails: { maxDurationMs: 120_000 } },
  computer: { baseRisk: 'high', defaultGuardrails: { requireConfirmation: true } },
  node_dispatch: { baseRisk: 'high', defaultGuardrails: { requireConfirmation: true } },
  chrome_execute_js: { baseRisk: 'high', defaultGuardrails: { requireConfirmation: true } },
  chrome_navigate: { baseRisk: 'medium', defaultGuardrails: { allowedDomains: [] } },
  chrome_create_tab: { baseRisk: 'medium', defaultGuardrails: { allowedDomains: [] } },
  chrome_upload_file: { baseRisk: 'medium', defaultGuardrails: { restrictedPaths: [], requireConfirmation: true } },
  chrome_save_page: { baseRisk: 'medium', defaultGuardrails: { restrictedPaths: [], requireConfirmation: true } },
  chrome_manage_downloads: { baseRisk: 'medium', defaultGuardrails: { restrictedPaths: [], requireConfirmation: true } },
  chrome_network_rules: { baseRisk: 'high', defaultGuardrails: { requireConfirmation: true } },
  chrome_fill_form: { baseRisk: 'medium', defaultGuardrails: { requireConfirmation: true } },
  chrome_type_text: { baseRisk: 'medium', defaultGuardrails: { requireConfirmation: true } },
  chrome_http_auth: { baseRisk: 'high', defaultGuardrails: { requireConfirmation: true } },
  code_index: { baseRisk: 'low', defaultGuardrails: { readOnly: true } },
  code_pilot: { baseRisk: 'medium', defaultGuardrails: { maxDurationMs: 60_000 } },
};

export async function evaluateToolPermission(
  toolName: string,
  args: Record<string, unknown>,
  scope: TaskScope,
): Promise<DynamicGrantResult> {
  const startTime = Date.now();

  const policyDecision = await checkPolicy('tool', toolName);
  if (!policyDecision.allowed) {
    return {
      decision: 'denied',
      reason: policyDecision.reason,
      riskLevel: 'critical',
      policyRule: policyDecision.rule,
      approvalRequired: false,
    };
  }

  if (hasTemporaryGrant(scope.sessionId, toolName)) {
    return {
      decision: 'granted',
      reason: 'Previously approved by human reviewer',
      riskLevel: 'low',
      approvalRequired: false,
    };
  }

  const riskLevel = assessToolRisk(toolName, args);
  const profile = TOOL_RISK_PROFILES[toolName];

  let decision: GrantDecision;
  let guardrails: GuardrailSet | undefined;
  let approvalRequired = false;

  if (riskLevel === 'critical') {
    decision = 'requires_approval';
    approvalRequired = true;
    guardrails = { requireConfirmation: true };
  } else if (riskLevel === 'high') {
    decision = 'granted_with_guardrails';
    approvalRequired = scope.requiredCapabilities.includes('sensitive_data');
    guardrails = profile?.defaultGuardrails;
  } else if (riskLevel === 'medium') {
    decision = 'granted_with_guardrails';
    guardrails = profile?.defaultGuardrails;
  } else {
    decision = 'granted';
  }

  const result: DynamicGrantResult = {
    decision,
    reason: decision === 'granted'
      ? `Tool ${toolName} allowed for task ${scope.taskId}`
      : `Tool ${toolName} requires guardrails or approval for task ${scope.taskId}`,
    riskLevel,
    guardrails,
    policyRule: policyDecision.rule,
    approvalRequired,
  };

  await logEvent({
    event_type: 'dynamic_grant',
    session_id: scope.sessionId,
    actor: 'dynamic-grant-engine',
    action: `grant:${toolName}`,
    summary: `Dynamic grant: ${decision} (risk: ${riskLevel})`,
    started_at: new Date(startTime).toISOString(),
    payload: { toolName, scope: scope.taskId, decision, riskLevel },
  });

  return result;
}

function assessToolRisk(
  toolName: string,
  args: Record<string, unknown>,
): 'low' | 'medium' | 'high' | 'critical' {
  const profile = TOOL_RISK_PROFILES[toolName];
  if (profile) {
    return assessRiskLevel(toolName, args);
  }

  if (
    toolName.startsWith('mcp_') || toolName.startsWith('a2a_') || toolName.startsWith('chrome_')
  ) {
    return 'medium';
  }

  return 'low';
}

export function isGuardrailSatisfied(
  guardrail: GuardrailSet,
  toolName: string,
  args: Record<string, unknown>,
  workingDir: string,
): { satisfied: boolean; violation?: string } {
  if (guardrail.readOnly) {
    const writeTools = [
      'file_write',
      'file_edit',
      'file_delete',
      'file_patch',
      'file_rename',
      'shell',
      'code_exec',
    ];
    if (writeTools.includes(toolName)) {
      return {
        satisfied: false,
        violation: 'Tool requires write access but guardrail enforces read-only',
      };
    }
  }

  if (guardrail.restrictedPaths && guardrail.restrictedPaths.length > 0) {
    const path = String(args.path ?? args.filePath ?? args.file ?? '');
    if (path && guardrail.restrictedPaths.some((restricted) => path.startsWith(restricted))) {
      return { satisfied: false, violation: `Path ${path} is restricted by guardrail` };
    }
  }

  if (guardrail.allowedDomains && guardrail.allowedDomains.length > 0) {
    const url = String(args.url ?? args.query ?? '');
    if (url) {
      const domain = extractDomain(url);
      if (domain && !guardrail.allowedDomains.some((allowed) => domain.includes(allowed))) {
        return { satisfied: false, violation: `Domain ${domain} not in allowed list` };
      }
    }
  }

  return { satisfied: true };
}

function extractDomain(url: string): string | null {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
  } catch {
    return null;
  }
}
