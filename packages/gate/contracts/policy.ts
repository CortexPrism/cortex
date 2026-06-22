import type { ISessionContext } from '../../core/contracts/mod.ts';

export type PolicyKind = 'tool' | 'shell' | 'domain' | 'capability' | 'path' | 'computer';

export type PolicyEffect = 'allow' | 'deny';

export interface IPolicyRule {
  id: string;
  kind: PolicyKind;
  effect: PolicyEffect;
  pattern: string;
  reason?: string;
  priority: number;
  enabled: boolean;
}

export interface IPolicyDecision {
  allowed: boolean;
  rule?: IPolicyRule;
  reason: string;
}

export interface IPolicyContext extends ISessionContext {
  toolName?: string;
  command?: string;
  path?: string;
  domain?: string;
  capability?: string;
}

export interface IPolicyEngine {
  evaluate(action: string, context: IPolicyContext): Promise<IPolicyDecision>;
}
