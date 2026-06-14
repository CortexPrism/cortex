import { getCoreDb } from '../db/client.ts';
import type { InValue } from 'npm:@libsql/client';

export type PolicyKind = 'tool' | 'shell' | 'domain' | 'capability' | 'path';
export type PolicyEffect = 'allow' | 'deny';

export interface PolicyRule {
  id: string;
  kind: PolicyKind;
  effect: PolicyEffect;
  pattern: string;
  reason: string | null;
  priority: number;
  created_at: string;
}

export interface PolicyDecision {
  allowed: boolean;
  rule: PolicyRule | null;
  reason: string;
}

function policyId(): string {
  return `pol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function checkPolicy(
  kind: PolicyKind,
  value: string,
): Promise<PolicyDecision> {
  const db = await getCoreDb();
  const rules = await db.all<PolicyRule>(
    `SELECT * FROM policy_rules WHERE kind = ? ORDER BY priority ASC`,
    [kind],
  );

  for (const rule of rules) {
    try {
      const re = new RegExp(rule.pattern, 'i');
      if (re.test(value)) {
        return {
          allowed: rule.effect === 'allow',
          rule,
          reason: rule.reason ?? (rule.effect === 'deny' ? `Denied by rule: ${rule.pattern}` : 'Allowed'),
        };
      }
    } catch {
      continue;
    }
  }

  return { allowed: true, rule: null, reason: 'No matching rule — default allow' };
}

export async function addPolicy(opts: {
  kind: PolicyKind;
  effect: PolicyEffect;
  pattern: string;
  reason?: string;
  priority?: number;
}): Promise<string> {
  const db = await getCoreDb();
  const id = policyId();
  await db.run(
    `INSERT INTO policy_rules (id, kind, effect, pattern, reason, priority, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    [id, opts.kind, opts.effect, opts.pattern, opts.reason ?? null, opts.priority ?? 100] as InValue[],
  );
  return id;
}

export async function removePolicy(id: string): Promise<boolean> {
  const db = await getCoreDb();
  const existing = await db.all(`SELECT id FROM policy_rules WHERE id = ? LIMIT 1`, [id]);
  if (!existing.length) return false;
  await db.run(`DELETE FROM policy_rules WHERE id = ?`, [id]);
  return true;
}

export async function listPolicies(): Promise<PolicyRule[]> {
  const db = await getCoreDb();
  return await db.all<PolicyRule>(
    `SELECT * FROM policy_rules ORDER BY kind, priority ASC`,
  );
}
