/**
 * Data Classification — Auto-detect sensitivity levels
 *
 * Classification levels:
 * - 'public'    — can be freely accessed by any agent
 * - 'normal'    — standard data, basic checks apply
 * - 'sensitive' — DEFAULT, requires justification + supervisor approval
 * - 'secret'    — requires human approval (passwords, API keys, PII)
 */

export type SensitivityLevel = 'public' | 'normal' | 'sensitive' | 'secret';

/**
 * Patterns that indicate SECRET-level data
 * These require human approval to access
 */
const SECRET_PATTERNS = [
  // Authentication credentials
  /\b(password|passwd|pwd)\s*[:=]/i,
  /\b(api[_-]?key|apikey|access[_-]?token|auth[_-]?token)\s*[:=]/i,
  /\b(secret|private[_-]?key|bearer)\s*[:=]/i,

  // Long random strings that look like tokens
  /\b[A-Za-z0-9_-]{40,}\b/, // 40+ char alphanumeric (API keys, tokens)
  /\b[A-Fa-f0-9]{64,}\b/, // 64+ char hex (SHA256, crypto keys)

  // Credit card patterns (Luhn algorithm not checked, just format)
  /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/,

  // Social Security Numbers (US)
  /\b\d{3}-\d{2}-\d{4}\b/,

  // AWS credentials
  /AKIA[0-9A-Z]{16}/,

  // Private keys (PEM format)
  /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,

  // Database connection strings
  /\b(mongodb|postgres|mysql|redis):\/\/[^\s]+:[^\s]+@/i,

  // Email/password combinations
  /\b(email|username)\s*[:=][^\n]+\n[^\n]*(password|passwd)/i,
];

/**
 * Patterns that indicate SENSITIVE-level data
 * These require supervisor approval to access
 */
const SENSITIVE_PATTERNS = [
  // Personal Identifiable Information
  /\b(email|phone|address|birthday|birthdate|ssn|social.security)\b/i,
  /\b(credit.card|bank.account|routing.number)\b/i,

  // Confidential/Internal markers
  /\b(confidential|private|internal.only|do.not.share)\b/i,
  /\b(restricted|classified|proprietary)\b/i,

  // Personal preferences that might be sensitive
  /\b(medical|health|diagnosis|prescription)\b/i,
  /\b(salary|income|compensation|payroll)\b/i,
  /\b(religion|political.affiliation)\b/i,

  // User-provided secrets (even if not matching patterns above)
  /this is (my|the) (password|secret|key)/i,
  /don't (tell|share|mention)/i,
];

/**
 * Classify content based on heuristic pattern matching
 * Default is 'sensitive' (security-first approach per plan)
 *
 * @param text — The content to classify
 * @returns Sensitivity level
 */
export function classifyContent(text: string | null | undefined): SensitivityLevel {
  if (!text || text.trim().length === 0) {
    return 'normal'; // Empty content is not sensitive
  }

  // Check for secret patterns first (most restrictive)
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      return 'secret';
    }
  }

  // Check for sensitive patterns
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(text)) {
      return 'sensitive';
    }
  }

  // Default to 'sensitive' for non-empty content (security-first per plan)
  // Only known-safe content should be downgraded to 'normal' or 'public'
  return 'sensitive';
}

/**
 * Combine multiple text fields and return the highest sensitivity level
 *
 * @param texts — Array of text content to classify
 * @returns The highest sensitivity level found
 */
export function classifyMultiple(...texts: (string | null | undefined)[]): SensitivityLevel {
  const levels: SensitivityLevel[] = texts.map(classifyContent);

  // Return the most restrictive level
  if (levels.includes('secret')) return 'secret';
  if (levels.includes('sensitive')) return 'sensitive';
  if (levels.includes('normal')) return 'normal';
  return 'public';
}

/**
 * Manually override classification for known-safe content
 * Use sparingly — default should always be 'sensitive'
 *
 * @param level — The level to assign
 * @returns The level (for fluent API)
 */
export function markAs(level: SensitivityLevel): SensitivityLevel {
  return level;
}

/**
 * Check if a given level requires supervisor approval
 */
export function requiresSupervisor(level: SensitivityLevel): boolean {
  return level === 'sensitive' || level === 'secret';
}

/**
 * Check if a given level requires human approval
 */
export function requiresHuman(level: SensitivityLevel): boolean {
  return level === 'secret';
}
