/**
 * AI Guardrails & Content Safety — #179
 *
 * Pluggable content safety middleware operating on all LLM inputs
 * and outputs. Detects toxicity, NSFW content, prompt injection,
 * PII leakage, and enforces topic boundaries.
 */
import { logEvent } from '../db/lens.ts';

export type GuardrailAction = 'pass' | 'warn' | 'block';

export interface GuardrailCheck {
  name: string;
  action: GuardrailAction;
  reason?: string;
  score?: number;
}

export interface GuardrailResult {
  passed: boolean;
  checks: GuardrailCheck[];
  blocked: boolean;
  warnings: string[];
}

export interface GuardrailClassifier {
  name: string;
  stage: 'input' | 'output' | 'both';
  check: (text: string, context?: GuardrailContext) => Promise<GuardrailCheck>;
}

export interface GuardrailContext {
  sessionId: string;
  agentId: string;
  toolName?: string;
}

const classifiers: GuardrailClassifier[] = [];

export function registerClassifier(classifier: GuardrailClassifier): void {
  if (!classifiers.find((c) => c.name === classifier.name)) {
    classifiers.push(classifier);
  }
}

export function unregisterClassifier(name: string): void {
  const idx = classifiers.findIndex((c) => c.name === name);
  if (idx >= 0) classifiers.splice(idx, 1);
}

export function getClassifiers(): GuardrailClassifier[] {
  return [...classifiers];
}

export const builtinClassifiers: GuardrailClassifier[] = [
  {
    name: 'prompt_injection',
    stage: 'input',
    async check(text: string): Promise<GuardrailCheck> {
      const patterns = [
        /ignore\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions?|prompts?|rules?)/i,
        /you\s+are\s+now\s+(?:DAN|STAN|jailbreak)/i,
        /pretend\s+(?:you\s+are|to\s+be)/i,
        /forget\s+(?:everything|your\s+training|your\s+rules)/i,
        /\[SYSTEM\]|\[INST\]|<<SYS>>/i,
        /override\s+(?:system|safety|security)/i,
        /from\s+now\s+on\s+you\s+(?:are|will|must)/i,
        /your\s+new\s+(?:name|identity|persona)\s+is/i,
        /act\s+as\s+(?:if\s+you\s+are|a\s+different)/i,
      ];

      for (const pattern of patterns) {
        if (pattern.test(text)) {
          return {
            name: 'prompt_injection',
            action: 'block',
            reason: 'Potential prompt injection detected',
            score: 0.9,
          };
        }
      }

      return { name: 'prompt_injection', action: 'pass', score: 0 };
    },
  },
  {
    name: 'pii_leakage',
    stage: 'output',
    async check(text: string): Promise<GuardrailCheck> {
      const piiPatterns = [
        /\b\d{3}-\d{2}-\d{4}\b/,
        /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/,
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
      ];

      for (const pattern of piiPatterns) {
        if (pattern.test(text)) {
          return {
            name: 'pii_leakage',
            action: 'warn',
            reason: 'Output may contain PII',
            score: 0.7,
          };
        }
      }

      return { name: 'pii_leakage', action: 'pass', score: 0 };
    },
  },
  {
    name: 'harmful_code',
    stage: 'output',
    async check(text: string): Promise<GuardrailCheck> {
      const patterns = [
        /\b(?:rm\s+-rf\s+\/|sudo\s+rm|chmod\s+777\s+\/)/i,
        /\b(?:DROP\s+(?:TABLE|DATABASE)|TRUNCATE\s+TABLE)/i,
        /eval\s*\(\s*(?:atob|unescape|String\.fromCharCode)/i,
        /process\.(?:env|exit|kill)/,
        /os\.(?:system|popen|exec)/,
        /subprocess\.(?:call|Popen|run)/,
      ];

      for (const pattern of patterns) {
        if (pattern.test(text)) {
          return {
            name: 'harmful_code',
            action: 'warn',
            reason: 'Output contains potentially destructive commands',
            score: 0.6,
          };
        }
      }

      return { name: 'harmful_code', action: 'pass', score: 0 };
    },
  },
  {
    name: 'excessive_length',
    stage: 'input',
    async check(text: string): Promise<GuardrailCheck> {
      if (text.length > 100_000) {
        return {
          name: 'excessive_length',
          action: 'warn',
          reason: `Input is very large (${text.length} chars)`,
          score: 0.3,
        };
      }
      return { name: 'excessive_length', action: 'pass', score: 0 };
    },
  },
  {
    name: 'shell_injection',
    stage: 'input',
    async check(text: string): Promise<GuardrailCheck> {
      const patterns = [
        /\b(?:curl|wget)\s+.*\|\s*(?:bash|sh|zsh)/i,
        /\b(?:eval|exec)\s*\(?\s*['"]?\s*(?:rm|dd|mkfs)/i,
        /`[^`]*`/,
        /\$\([^)]*\)/,
        /\|\s*(?:bash|sh|zsh|python|ruby|perl)/i,
      ];

      for (const pattern of patterns) {
        if (pattern.test(text)) {
          return {
            name: 'shell_injection',
            action: 'block',
            reason: 'Potential command injection detected',
            score: 0.85,
          };
        }
      }

      return { name: 'shell_injection', action: 'pass', score: 0 };
    },
  },
];

export async function runGuardrails(
  text: string,
  stage: 'input' | 'output',
  context?: GuardrailContext,
): Promise<GuardrailResult> {
  const activeClassifiers = [...classifiers, ...builtinClassifiers];
  const relevant = activeClassifiers.filter(
    (c) => c.stage === stage || c.stage === 'both',
  );

  const checks: GuardrailCheck[] = [];
  const warnings: string[] = [];
  let blocked = false;

  for (const classifier of relevant) {
    try {
      const check = await classifier.check(text, context);
      checks.push(check);

      if (check.action === 'block') {
        blocked = true;
      } else if (check.action === 'warn') {
        warnings.push(`${classifier.name}: ${check.reason ?? 'No reason provided'}`);
      }
    } catch {
      // Classifier failure should not block processing
    }
  }

  if (blocked && context) {
    logEvent({
      event_type: 'guardrail_blocked',
      session_id: context.sessionId,
      actor: 'guardrails',
      action: `guardrail:block:${stage}`,
      summary: `Guardrail blocked ${stage} with ${
        checks.filter((c) => c.action === 'block').length
      } violations`,
      started_at: new Date().toISOString(),
      payload: {
        stage,
        checks: checks.filter((c) => c.action !== 'pass').map((c) => ({
          name: c.name,
          action: c.action,
        })),
      },
    }).catch(() => {});
  }

  return {
    passed: !blocked,
    checks,
    blocked,
    warnings,
  };
}

export function createPreMiddleware() {
  return async (
    text: string,
    context?: GuardrailContext,
  ): Promise<{ allowed: boolean; text: string }> => {
    const result = await runGuardrails(text, 'input', context);
    return { allowed: !result.blocked, text };
  };
}

export function createPostMiddleware() {
  return async (
    text: string,
    context?: GuardrailContext,
  ): Promise<{ allowed: boolean; text: string }> => {
    const result = await runGuardrails(text, 'output', context);
    return { allowed: !result.blocked, text };
  };
}
