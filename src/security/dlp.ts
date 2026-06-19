/**
 * Data Loss Prevention Guard — #137
 *
 * Scans all agent outputs (tool results, generated code, messages) for
 * sensitive data: API keys, credentials, PII, PHI, PCI data.
 * Redacts or blocks before data leaves Cortex's boundary.
 */
import { logEvent } from '../db/lens.ts';

export type DLPLevel = 'monitor' | 'redact' | 'block';

export interface DLPMatch {
  type: string;
  start: number;
  end: number;
  value: string;
  redacted: string;
}

export interface DLPResult {
  passed: boolean;
  matches: DLPMatch[];
  redactedText: string;
  action: DLPLevel;
}

export interface DLPPolicy {
  level: DLPLevel;
  patterns: DLPScanner[];
  allowlist?: string[];
  sessionId?: string;
}

interface DLPScanner {
  name: string;
  pattern: RegExp;
  redaction: string;
  level: DLPLevel;
}

const DEFAULT_SCANNERS: DLPScanner[] = [
  {
    name: 'aws_access_key',
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    redaction: '[AWS_KEY]',
    level: 'redact',
  },
  {
    name: 'aws_secret_key',
    pattern: /\b(?<!AKIA)[A-Za-z0-9/+=]{40}\b/g,
    redaction: '[AWS_SECRET]',
    level: 'redact',
  },
  {
    name: 'github_token',
    pattern: /\bghp_[A-Za-z0-9]{36}\b/g,
    redaction: '[GH_TOKEN]',
    level: 'redact',
  },
  {
    name: 'github_pat',
    pattern: /\bgithub_pat_[A-Za-z0-9_]{36,}\b/g,
    redaction: '[GH_PAT]',
    level: 'redact',
  },
  {
    name: 'openai_key',
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/g,
    redaction: '[OPENAI_KEY]',
    level: 'redact',
  },
  {
    name: 'anthropic_key',
    pattern: /\bsk-ant-[A-Za-z0-9_-]{32,}\b/g,
    redaction: '[ANTHROPIC_KEY]',
    level: 'redact',
  },
  {
    name: 'google_api_key',
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    redaction: '[GOOGLE_KEY]',
    level: 'redact',
  },
  {
    name: 'jwt_token',
    pattern: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
    redaction: '[JWT]',
    level: 'redact',
  },
  {
    name: 'private_key',
    pattern:
      /-----BEGIN\s(?:RSA|EC|DSA|OPENSSH)\sPRIVATE\sKEY-----[\s\S]*?-----END\s(?:RSA|EC|DSA|OPENSSH)\sPRIVATE\sKEY-----/g,
    redaction: '[PRIVATE_KEY]',
    level: 'block',
  },
  {
    name: 'pem_cert',
    pattern: /-----BEGIN\sCERTIFICATE-----[\s\S]*?-----END\sCERTIFICATE-----/g,
    redaction: '[CERTIFICATE]',
    level: 'redact',
  },
  {
    name: 'connection_string',
    pattern: /\b(?:mongodb|postgres|mysql|redis|sqlite):\/\/[^\s"']+/gi,
    redaction: '[CONNSTR]',
    level: 'block',
  },
  {
    name: 'slack_token',
    pattern: /\bxox[bprs]-[0-9A-Za-z-]+\b/g,
    redaction: '[SLACK_TOKEN]',
    level: 'redact',
  },
  {
    name: 'discord_token',
    pattern: /\b[MNO][A-Za-z\d_-]{23,25}\.[A-Za-z\d_-]{6}\.[A-Za-z\d_-]{27,}\b/g,
    redaction: '[DISCORD_TOKEN]',
    level: 'redact',
  },
  {
    name: 'credit_card',
    pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    redaction: '[CREDIT_CARD]',
    level: 'redact',
  },
  { name: 'ssn', pattern: /\b\d{3}-\d{2}-\d{4}\b/g, redaction: '[SSN]', level: 'redact' },
  {
    name: 'email',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    redaction: '[EMAIL]',
    level: 'redact',
  },
  {
    name: 'ip_address',
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    redaction: '[IP]',
    level: 'redact',
  },
  {
    name: 'password_field',
    pattern: /\b(?:password|passwd|pwd|secret|token)\s*[:=]\s*[^\s"',;}\]]+/gi,
    redaction: '[REDACTED_PASSWORD]',
    level: 'redact',
  },
  {
    name: 'api_key_header',
    pattern: /\b(?:x-api-key|api[_-]?key)\s*[:=]\s*[A-Za-z0-9_-]{10,}/gi,
    redaction: '[API_KEY]',
    level: 'redact',
  },
  {
    name: 'bearer_token',
    pattern: /\bBearer\s+[A-Za-z0-9._~+/-]+=*\b/g,
    redaction: '[BEARER_TOKEN]',
    level: 'block',
  },
  {
    name: 'basic_auth',
    pattern: /\bBasic\s+[A-Za-z0-9+/=]+\b/g,
    redaction: '[BASIC_AUTH]',
    level: 'block',
  },
];

export function createDLPPolicy(overrides?: Partial<DLPPolicy>): DLPPolicy {
  return {
    level: overrides?.level ?? 'redact',
    patterns: overrides?.patterns ?? DEFAULT_SCANNERS,
    allowlist: overrides?.allowlist ?? [],
    sessionId: overrides?.sessionId,
  };
}

export function scanForSensitiveData(
  text: string,
  policy?: DLPPolicy,
): DLPResult {
  const scanners = policy?.patterns ?? DEFAULT_SCANNERS;
  const effectiveLevel = policy?.level ?? 'redact';
  const allowlist = policy?.allowlist ?? [];

  const matches: DLPMatch[] = [];
  let redacted = text;

  for (const scanner of scanners) {
    scanner.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = scanner.pattern.exec(text)) !== null) {
      if (allowlist.some((allowed) => match![0].includes(allowed))) continue;

      matches.push({
        type: scanner.name,
        start: match.index,
        end: match.index + match[0].length,
        value: match[0],
        redacted: scanner.redaction,
      });

      scanner.pattern.lastIndex = match.index + 1;
    }
  }

  matches.sort((a, b) => a.start - b.start);

  const nonOverlapping: DLPMatch[] = [];
  let lastEnd = 0;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      nonOverlapping.push(m);
      lastEnd = m.end;
    }
  }

  for (let i = nonOverlapping.length - 1; i >= 0; i--) {
    const m = nonOverlapping[i];
    redacted = redacted.slice(0, m.start) + m.redacted + redacted.slice(m.end);
  }

  const passed = nonOverlapping.every((m) => {
    const scanner = scanners.find((s) => s.name === m.type);
    if (!scanner) return true;
    if (effectiveLevel === 'block' && scanner.level === 'block') return false;
    return true;
  });

  return {
    passed,
    matches: nonOverlapping,
    redactedText: redacted,
    action: effectiveLevel,
  };
}

export function dlpMiddleware(
  text: string,
  sessionId: string,
  policy?: DLPPolicy,
): { allowed: boolean; text: string } {
  const effectivePolicy = policy ?? createDLPPolicy({ sessionId });
  const result = scanForSensitiveData(text, effectivePolicy);

  if (!result.passed) {
    logEvent({
      event_type: 'dlp_blocked',
      session_id: sessionId,
      actor: 'dlp-guard',
      action: 'dlp:block',
      summary: `DLP blocked output with ${result.matches.length} sensitive matches`,
      started_at: new Date().toISOString(),
      payload: { matchTypes: result.matches.map((m) => m.type) },
    }).catch(() => {});
    return { allowed: false, text: '' };
  }

  if (result.matches.length > 0) {
    logEvent({
      event_type: 'dlp_redacted',
      session_id: sessionId,
      actor: 'dlp-guard',
      action: 'dlp:redact',
      summary: `DLP redacted ${result.matches.length} sensitive matches`,
      started_at: new Date().toISOString(),
      payload: { matchTypes: result.matches.map((m) => m.type) },
    }).catch(() => {});
    return { allowed: true, text: result.redactedText };
  }

  return { allowed: true, text };
}
