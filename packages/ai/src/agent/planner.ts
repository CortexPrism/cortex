import { logEvent } from '../../../../src/db/lens.ts';

export interface PlanArtifact {
  id: string;
  sessionId: string;
  turnId: string;
  decision: string;
  reason: string;
  suggestedPrefix?: string;
  suggestedSubAgents?: string[];
  confidence?: number;
  signalBreakdown?: Record<string, number>;
  policyChecked: boolean;
  policyViolations: string[];
  createdAt: string;
}

export async function logPlan(plan: Omit<PlanArtifact, 'id' | 'createdAt'>): Promise<void> {
  const id = `plan_${Date.now().toString(36)}`;

  await logEvent({
    event_type: 'meta_assessment',
    session_id: plan.sessionId,
    actor: 'metacognition',
    action: plan.decision,
    started_at: new Date().toISOString(),
    summary: plan.reason.slice(0, 500),
    payload: {
      id,
      turnId: plan.turnId,
      decision: plan.decision,
      reason: plan.reason,
      suggestedPrefix: plan.suggestedPrefix,
      suggestedSubAgents: plan.suggestedSubAgents,
      confidence: plan.confidence,
      signalBreakdown: plan.signalBreakdown,
      policyChecked: plan.policyChecked,
      policyViolations: plan.policyViolations,
    },
  }).catch(() => {});
}

export async function checkPlanPolicies(
  planActions: string[],
): Promise<{ violations: string[] }> {
  const violations: string[] = [];

  for (const action of planActions) {
    try {
      const { checkPolicy } = await import('../../../../src/security/policy.ts');
      const decision = await checkPolicy('tool' as const, action);
      if (!decision.allowed) {
        violations.push(`${action}: ${decision.reason}`);
      }
    } catch {
      // policy check failure is non-fatal
    }
  }

  return { violations };
}

const plans: PlanArtifact[] = [];
const MAX_PLANS = 200;

export function storePlan(plan: PlanArtifact): void {
  plans.push(plan);
  while (plans.length > MAX_PLANS) plans.shift();
}

export function listPlans(sessionId?: string, limit = 20): PlanArtifact[] {
  const filtered = sessionId ? plans.filter((p) => p.sessionId === sessionId) : plans;
  return filtered.slice(-limit).reverse();
}
