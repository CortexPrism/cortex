/**
 * Compliance Metadata — EU AI Act / ISO 42001 / SOC2 governance layer
 *
 * Auto-classifies sessions and turns with structured compliance metadata:
 * - Risk levels (low, medium, high, critical)
 * - Data categories touched (PII, financial, health, credentials, proprietary, public, system, code, user_content)
 * - Regulatory frameworks (EU AI Act, GDPR, ISO 42001, SOC2, HIPAA, PCI DSS)
 * - Approver identity, retention policy, data sovereignty
 *
 * Built on top of the existing Lens audit system and sensitivity classification.
 */

import { getLensDb } from '../../../../src/db/client.ts';
import { type EventType, logEvent } from '../../../../src/db/lens.ts';
import type { SensitivityLevel } from './classification.ts';

// ── Types ────────────────────────────────────────────

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type DataCategory =
  | 'pii'
  | 'financial'
  | 'health'
  | 'credentials'
  | 'proprietary'
  | 'public'
  | 'system'
  | 'code'
  | 'user_content';

export type RegulatoryFramework =
  | 'EU AI Act'
  | 'GDPR'
  | 'ISO 42001'
  | 'SOC2'
  | 'HIPAA'
  | 'PCI DSS';

export interface ComplianceRecord {
  id: string;
  sessionId: string;
  turnId?: string;
  riskLevel: RiskLevel;
  dataCategories: DataCategory[];
  frameworks: RegulatoryFramework[];
  approver?: string;
  retentionDays: number;
  dataRegion: string;
  auditable: boolean;
  auditSummary?: string;
  context?: Record<string, unknown>;
  exportedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TurnComplianceInput {
  sessionId: string;
  turnId: string;
  sensitivityLevel?: SensitivityLevel;
  toolNamesUsed?: string[];
  shellCommandsRun?: string[];
  pathsAccessed?: string[];
  domainsContacted?: string[];
  modelUsed?: string;
  dataInvolved?: string[];
}

export interface SessionComplianceInput {
  sessionId: string;
  agentId?: string;
  taskDescription?: string;
  toolsAllowed?: string[];
  maxRiskAnticipated?: RiskLevel;
  regulatoryContext?: RegulatoryFramework[];
  dataRegion?: string;
  retentionDays?: number;
}

export interface ComplianceExport {
  exportedAt: string;
  framework: string;
  records: ComplianceRecord[];
  summary: {
    totalSessions: number;
    riskDistribution: Record<RiskLevel, number>;
    categoriesTouched: DataCategory[];
    dateRange: { from: string; to: string };
  };
}

// ── Risk Classification ──────────────────────────────

const DESTRUCTIVE_TOOLS = new Set([
  'shell',
  'code_exec',
  'file_delete',
  'file_write',
  'file_patch',
  'git_push',
  'computer',
  'github_pr_create',
  'github_issue_create',
  'db_query',
]);

const HIGH_RISK_TOOLS = new Set([
  'file_edit',
  'file_move',
  'file_rename',
  'browser',
  'chrome_click',
  'chrome_type',
  'chrome_evaluate',
  'vault',
  'sub_agent',
  'node_dispatch',
]);

const NETWORK_TOOLS = new Set([
  'web_search',
  'web_fetch',
  'web_search_enhanced',
  'web_fetch_enhanced',
  'brave_search',
  'tavily_search',
  'firecrawl',
  'docs_search',
]);

const DESTRUCTIVE_SHELL_PATTERNS = [
  /\brm\s+-rf?\b/,
  /\bdd\s+if=/,
  /\bmkfs\b/,
  /\bchmod\s+777\b/,
  /\b>:?\s*\/dev\//,
  /\bcurl\b.*\|\s*(ba)?sh\b/,
  /\bwget\b.*\|\s*(ba)?sh\b/,
  /\bshutdown\b/,
  /\breboot\b/,
  /\bkill\s+-9\b/,
];

const SENSITIVE_PATH_PATTERNS = [
  /\/etc\/(passwd|shadow|sudoers)/,
  /\/root\//,
  /\/var\/log\//,
  /\.env$/,
  /\.pem$/,
  /id_rsa/,
  /\.ssh\//,
  /credentials/i,
  /secret/i,
];

// ── URL/Domain Normalization ─────────────────────────

const URL_HOST_RE = /^(?:https?:\/\/)?([^\/:\s?#]+)/i;

export function extractHostnames(urls: string[]): string[] {
  const hosts = new Set<string>();
  for (const raw of urls) {
    const m = raw.match(URL_HOST_RE);
    if (m && m[1]) {
      const host = m[1].toLowerCase();
      if (
        host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
        host.includes('::1') || host === '[::1]'
      ) {
        continue;
      }
      hosts.add(host.replace(/^www\./, ''));
    }
  }
  return [...hosts];
}

// ── Risk Classification ──────────────────────────────

function classifyRiskLevel(input: TurnComplianceInput): RiskLevel {
  let score = 0;

  // Destructive tool usage
  const toolSet = new Set(input.toolNamesUsed ?? []);
  for (const t of toolSet) {
    if (DESTRUCTIVE_TOOLS.has(t)) score += 3;
    else if (HIGH_RISK_TOOLS.has(t)) score += 2;
    else if (NETWORK_TOOLS.has(t)) score += 1;
  }

  // Destructive shell commands
  for (const cmd of input.shellCommandsRun ?? []) {
    for (const pattern of DESTRUCTIVE_SHELL_PATTERNS) {
      if (pattern.test(cmd)) {
        score += 3;
        break;
      }
    }
  }

  // Sensitive paths accessed
  for (const path of input.pathsAccessed ?? []) {
    for (const pattern of SENSITIVE_PATH_PATTERNS) {
      if (pattern.test(path)) {
        score += 2;
        break;
      }
    }
  }

  // Sensitivity level from classification
  if (input.sensitivityLevel === 'secret') score += 4;
  else if (input.sensitivityLevel === 'sensitive') score += 2;

  if (score >= 6) return 'critical';
  if (score >= 4) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

// ── Data Category Detection ──────────────────────────

function detectDataCategories(input: TurnComplianceInput): DataCategory[] {
  const categories = new Set<DataCategory>();

  const toolSet = new Set(input.toolNamesUsed ?? []);
  const paths = (input.pathsAccessed ?? []).join(' ');
  const domains = (input.domainsContacted ?? []).join(' ');
  const data = (input.dataInvolved ?? []).join(' ');

  // PII detection via tool usage patterns
  if (toolSet.has('vault') || paths.includes('.env') || paths.includes('credential')) {
    categories.add('credentials');
  }

  // External domains contacted
  const externalDomains = (input.domainsContacted ?? []).filter((d) =>
    !d.includes('localhost') && !d.includes('127.0.0.1') && !d.includes('::1')
  );
  if (externalDomains.length > 0) {
    categories.add('public');
  }

  const allText = `${paths} ${domains} ${data}`.toLowerCase();

  if (/email|phone|address|ssn|passport|social.security|date.of.birth|dob/i.test(allText)) {
    categories.add('pii');
  }
  if (
    /payment|invoice|salary|bank|credit.card|financial|price|revenue|transaction/i.test(allText)
  ) {
    categories.add('financial');
  }
  if (/medical|health|diagnosis|prescription|patient|clinical|phi|treatment/i.test(allText)) {
    categories.add('health');
  }
  if (/api[._-]?key|token|password|secret|credential|auth|jwt|bearer/i.test(allText)) {
    categories.add('credentials');
  }
  if (
    /proprietary|confidential|internal.only|restricted|classified|trade.secret|intellectual/i.test(
      allText,
    )
  ) {
    categories.add('proprietary');
  }

  // Code category if file tools used
  if (
    toolSet.has('file_read') || toolSet.has('file_edit') || toolSet.has('file_write') ||
    toolSet.has('code_exec')
  ) {
    categories.add('code');
  }

  // System category
  if (toolSet.has('shell') || paths.includes('/etc/') || paths.includes('/var/')) {
    categories.add('system');
  }

  // User content is always present if there's user input
  if (input.dataInvolved && input.dataInvolved.length > 0) {
    categories.add('user_content');
  }

  // Default to public if nothing detected
  if (categories.size === 0) {
    categories.add('public');
  }

  return [...categories];
}

// ── LLM-Based Data Category Refinement ────────────────

const LLM_CLASSIFIER_PROMPT =
  `You are a compliance data classifier. Analyze the following agent turn data and return a JSON object with two fields:

1. "dataCategories": an array of applicable categories. Valid categories:
   - "pii" — personally identifiable information (emails, SSNs, phone, addresses, names)
   - "financial" — payment data, invoices, salary, banking, transaction data
   - "health" — medical records, diagnoses, prescriptions, PHI, patient data
   - "credentials" — API keys, passwords, tokens, secrets, auth data
   - "proprietary" — trade secrets, confidential business data, internal-only, classified
   - "public" — publicly accessible data, external websites
   - "system" — system configuration, OS internals, infrastructure
   - "code" — source code, scripts, configuration files
   - "user_content" — user-provided text content

2. "riskAdjustment": an integer from -2 to +2 to adjust the pre-computed risk score.
   - +2: the data is more dangerous than the tool-based score suggests
   - +1: slightly higher risk
   - 0: tool-based score is accurate
   - -1: slightly lower risk
   - -2: the data is safe despite tool-based score

Return ONLY valid JSON, no other text.

Turn data to classify:
Risk score from tools: %RISK_SCORE%
Tools used: %TOOLS%
Shell commands: %SHELL%
Paths accessed: %PATHS%
Domains contacted: %DOMAINS%
Data sample (first 1000 chars): %DATA%
Context summary: %CONTEXT%`;

interface LLMClassifierResult {
  dataCategories: string[];
  riskAdjustment: number;
}

async function classifyWithLLM(
  input: TurnComplianceInput,
  currentScore: number,
  currentCategories: DataCategory[],
): Promise<{ categories: DataCategory[]; riskAdjustment: number } | null> {
  try {
    const { loadConfig } = await import('../config/config.ts');
    const config = await loadConfig();

    const classifierCfg = config.compliance?.llmClassifier;
    if (!classifierCfg?.enabled) return null;

    // Only run LLM classifier when risk is high/critical or data looks sparse
    const shouldRun = currentScore >= 4 || currentCategories.length <= 1;
    if (!shouldRun) return null;

    let provider;
    let model = classifierCfg.model ?? config.providers?.openai?.model ?? 'gpt-4o-mini';

    const { buildProviderFromConfig } = await import('../llm/router.ts');

    if (classifierCfg.provider === 'ollama' && classifierCfg.model) {
      provider = buildProviderFromConfig('ollama', {
        kind: 'ollama',
        apiKey: '',
        model: classifierCfg.model,
      });
    } else {
      provider = buildProviderFromConfig('openai', {
        kind: 'openai',
        apiKey: Deno.env.get('OPENAI_API_KEY') ?? config.providers?.openai?.apiKey ?? '',
        model,
      });
    }

    if (!provider) return null;

    const prompt = LLM_CLASSIFIER_PROMPT
      .replace('%RISK_SCORE%', String(currentScore))
      .replace('%TOOLS%', (input.toolNamesUsed ?? []).join(', ') || 'none')
      .replace(
        '%SHELL%',
        (input.shellCommandsRun ?? []).map((c) => c.slice(0, 100)).join('; ') || 'none',
      )
      .replace('%PATHS%', (input.pathsAccessed ?? []).join(', ') || 'none')
      .replace('%DOMAINS%', extractHostnames(input.domainsContacted ?? []).join(', ') || 'none')
      .replace('%DATA%', (input.dataInvolved ?? []).join(' ').slice(0, 1000))
      .replace('%CONTEXT%', input.sensitivityLevel ?? 'unknown');

    const result = await provider.complete({
      model,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 256,
      temperature: 0,
    });

    if (!result.content) return null;

    let parsed: LLMClassifierResult;
    try {
      const jsonStr = result.content.replace(/```json\s*|\s*```/g, '').trim();
      parsed = JSON.parse(jsonStr) as LLMClassifierResult;
    } catch {
      return null;
    }

    const validCategories = new Set<DataCategory>(
      (parsed.dataCategories ?? []).filter((c): c is DataCategory =>
        [
          'pii',
          'financial',
          'health',
          'credentials',
          'proprietary',
          'public',
          'system',
          'code',
          'user_content',
        ].includes(c)
      ),
    );

    const adjustment = Math.max(-2, Math.min(2, parsed.riskAdjustment ?? 0));

    return {
      categories: validCategories.size > 0 ? [...validCategories] : currentCategories,
      riskAdjustment: adjustment,
    };
  } catch {
    return null;
  }
}

// ── Recording ────────────────────────────────────────

function complianceId(): string {
  return `cmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function recordSessionCompliance(
  input: SessionComplianceInput,
): Promise<ComplianceRecord> {
  const db = await getLensDb();
  const id = complianceId();
  const now = new Date().toISOString();

  const riskLevel = input.maxRiskAnticipated ?? 'medium';
  const frameworks = input.regulatoryContext ?? ['EU AI Act'];
  const retentionDays = input.retentionDays ?? 90;
  const dataRegion = input.dataRegion ?? 'global';

  await db.run(
    `INSERT INTO compliance_metadata (
      id, session_id, risk_level, data_categories, frameworks,
      approver, retention_days, data_region, auditable, audit_summary, context, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    [
      id,
      input.sessionId,
      riskLevel,
      '[]',
      JSON.stringify(frameworks),
      null,
      retentionDays,
      dataRegion,
      input.taskDescription?.slice(0, 500) ?? null,
      input.agentId
        ? JSON.stringify({ agentId: input.agentId, toolsAllowed: input.toolsAllowed })
        : null,
      now,
      now,
    ],
  );

  await logEvent({
    event_type: 'compliance_session_start' as EventType,
    session_id: input.sessionId,
    actor: 'compliance',
    action: 'session_start',
    started_at: now,
    summary: `Session ${input.sessionId}: risk=${riskLevel}, frameworks=${frameworks.join(',')}`,
    payload: { id, riskLevel, frameworks, agentId: input.agentId },
  }).catch(() => {});

  return {
    id,
    sessionId: input.sessionId,
    riskLevel,
    dataCategories: [],
    frameworks,
    retentionDays,
    dataRegion,
    auditable: true,
    auditSummary: input.taskDescription?.slice(0, 500),
    context: input.agentId ? { agentId: input.agentId } : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

async function getSessionComplianceContext(
  sessionId: string,
): Promise<{ frameworks: RegulatoryFramework[]; retentionDays: number; dataRegion: string }> {
  const db = await getLensDb();
  const row = await db.get<{ frameworks: string; retention_days: number; data_region: string }>(
    `SELECT frameworks, retention_days, data_region FROM compliance_metadata
     WHERE session_id = ? AND turn_id IS NULL ORDER BY created_at DESC LIMIT 1`,
    [sessionId],
  );
  return {
    frameworks: row?.frameworks
      ? parseJsonArray<RegulatoryFramework>(row.frameworks)
      : ['EU AI Act'],
    retentionDays: row?.retention_days ?? 90,
    dataRegion: row?.data_region ?? 'global',
  };
}

export async function recordTurnCompliance(
  input: TurnComplianceInput,
): Promise<ComplianceRecord> {
  const db = await getLensDb();
  const id = complianceId();
  const now = new Date().toISOString();

  const riskLevel = classifyRiskLevel(input);
  const dataCategories = detectDataCategories(input);

  // Two-stage classification: run LLM classifier for high/critical risk or sparse results
  let refinedCategories = dataCategories;
  let refinedRisk = riskLevel;
  const currentScore = riskLevel === 'critical'
    ? 7
    : riskLevel === 'high'
    ? 5
    : riskLevel === 'medium'
    ? 3
    : 1;

  const llmResult = await classifyWithLLM(input, currentScore, dataCategories).catch(() => null);
  if (llmResult) {
    refinedCategories = llmResult.categories;
    const adjustedScore = Math.max(0, currentScore + llmResult.riskAdjustment);
    if (adjustedScore >= 6) refinedRisk = 'critical';
    else if (adjustedScore >= 4) refinedRisk = 'high';
    else if (adjustedScore >= 2) refinedRisk = 'medium';
    else refinedRisk = 'low';
  }

  // Alert on critical risk
  if (refinedRisk === 'critical') {
    escalateCriticalTurn(input, refinedCategories).catch(() => {});
  }
  const sessionCtx = await getSessionComplianceContext(input.sessionId).catch(() => ({
    frameworks: ['EU AI Act'] as RegulatoryFramework[],
    retentionDays: 90,
    dataRegion: 'global',
  }));

  // Resolve approver from active grants
  let approver: string | null = null;
  try {
    const { listGrants } = await import('./approval.ts');
    const grants = listGrants();
    for (const g of grants) {
      if ((g as unknown as Record<string, unknown>).sessionId === input.sessionId) {
        approver = 'human';
        break;
      }
    }
  } catch {
    // Approval system may not be loaded
  }

  await db.run(
    `INSERT INTO compliance_metadata (
      id, session_id, turn_id, risk_level, data_categories, frameworks,
      approver, retention_days, data_region, auditable, audit_summary, context, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    [
      id,
      input.sessionId,
      input.turnId,
      refinedRisk,
      JSON.stringify(refinedCategories),
      JSON.stringify(sessionCtx.frameworks),
      approver,
      sessionCtx.retentionDays,
      sessionCtx.dataRegion,
      `Tools: ${(input.toolNamesUsed ?? []).join(', ') || 'none'}`.slice(0, 500),
      JSON.stringify({
        toolsUsed: input.toolNamesUsed,
        shellCommands: input.shellCommandsRun?.length,
        pathsCount: input.pathsAccessed?.length ?? 0,
        domainsCount: input.domainsContacted?.length ?? 0,
        modelUsed: input.modelUsed,
        sensitivityLevel: input.sensitivityLevel,
        llmRefined: !!llmResult,
        originalRisk: riskLevel !== refinedRisk ? riskLevel : undefined,
        originalCategories: refinedCategories !== dataCategories ? dataCategories : undefined,
      }),
      now,
      now,
    ],
  );

  await logEvent({
    event_type: 'compliance_turn_recorded' as EventType,
    session_id: input.sessionId,
    turn_id: input.turnId,
    actor: 'compliance',
    action: 'turn_recorded',
    started_at: now,
    summary: `Turn ${input.turnId}: risk=${refinedRisk}, categories=${refinedCategories.join(',')}`,
    payload: {
      id,
      riskLevel: refinedRisk,
      dataCategories: refinedCategories,
      toolsUsed: input.toolNamesUsed,
      sensitivityLevel: input.sensitivityLevel,
      llmRefined: !!llmResult,
    },
  }).catch(() => {});

  return {
    id,
    sessionId: input.sessionId,
    turnId: input.turnId,
    riskLevel: refinedRisk,
    dataCategories: refinedCategories,
    frameworks: sessionCtx.frameworks,
    approver: approver ?? undefined,
    retentionDays: sessionCtx.retentionDays,
    dataRegion: sessionCtx.dataRegion,
    auditable: true,
    auditSummary: `Tools: ${(input.toolNamesUsed ?? []).join(', ') || 'none'}`.slice(0, 500),
    context: {
      toolsUsed: input.toolNamesUsed,
      shellCommands: input.shellCommandsRun?.length,
      modelUsed: input.modelUsed,
      llmRefined: !!llmResult,
    },
    createdAt: now,
    updatedAt: now,
  };
}

// ── Critical Turn Escalation ─────────────────────────

const CRITICAL_ESCALATION_COOLDOWN_MS = 60_000;
const lastCriticalAlert = new Map<string, number>();

async function escalateCriticalTurn(
  input: TurnComplianceInput,
  categories: DataCategory[],
): Promise<void> {
  const now = Date.now();
  const cooldownKey = input.sessionId;
  const last = lastCriticalAlert.get(cooldownKey) ?? 0;
  if (now - last < CRITICAL_ESCALATION_COOLDOWN_MS) return;
  lastCriticalAlert.set(cooldownKey, now);

  const summary = `CRITICAL risk turn in session ${input.sessionId} turn ${input.turnId}: ` +
    `tools=[${(input.toolNamesUsed ?? []).join(',')}], ` +
    `categories=[${categories.join(',')}]`;

  await logEvent({
    event_type: 'escalation' as EventType,
    session_id: input.sessionId,
    turn_id: input.turnId,
    actor: 'compliance',
    action: 'critical_turn_escalated',
    started_at: new Date().toISOString(),
    summary,
    payload: {
      riskLevel: 'critical',
      dataCategories: categories,
      toolsUsed: input.toolNamesUsed,
      shellCommands: input.shellCommandsRun?.slice(0, 5),
      pathsAccessed: input.pathsAccessed?.slice(0, 10),
      domainsContacted: extractHostnames(input.domainsContacted ?? []),
      modelUsed: input.modelUsed,
    },
  }).catch(() => {});

  // Fire compliance webhook if configured
  try {
    const { loadConfig } = await import('../config/config.ts');
    const config = await loadConfig();
    const webhookUrl = config.compliance?.alertWebhook;
    if (webhookUrl) {
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'compliance.critical_turn',
          sessionId: input.sessionId,
          turnId: input.turnId,
          riskLevel: 'critical',
          dataCategories: categories,
          toolsUsed: input.toolNamesUsed,
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {});
    }
  } catch {
    // Config may not be loaded
  }

  // Log a prominent warning
  console.error(`\n⚠ COMPLIANCE: Critical risk turn detected — ${summary}\n`);
}

export async function finalizeSessionCompliance(
  sessionId: string,
  summary?: string,
): Promise<void> {
  const now = new Date().toISOString();

  await logEvent({
    event_type: 'compliance_session_end' as EventType,
    session_id: sessionId,
    actor: 'compliance',
    action: 'session_end',
    started_at: now,
    summary: summary ?? `Session ${sessionId} finalized`,
  }).catch(() => {});
}

// ── Querying ─────────────────────────────────────────

export async function getSessionCompliance(
  sessionId: string,
): Promise<ComplianceRecord[]> {
  const db = await getLensDb();
  const rows = await db.all<Record<string, unknown>>(
    `SELECT * FROM compliance_metadata WHERE session_id = ? ORDER BY created_at ASC`,
    [sessionId],
  );
  return rows.map(parseComplianceRow);
}

export async function getTurnCompliance(
  sessionId: string,
  turnId: string,
): Promise<ComplianceRecord | null> {
  const db = await getLensDb();
  const row = await db.get<Record<string, unknown>>(
    `SELECT * FROM compliance_metadata WHERE session_id = ? AND turn_id = ? ORDER BY created_at DESC LIMIT 1`,
    [sessionId, turnId],
  );
  return row ? parseComplianceRow(row) : null;
}

export async function getComplianceByRisk(
  minRisk: RiskLevel = 'high',
  since?: string,
): Promise<ComplianceRecord[]> {
  const db = await getLensDb();
  const risks: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
  const minIdx = risks.indexOf(minRisk);
  const allowedRisks = risks.slice(minIdx);
  const placeholders = allowedRisks.map(() => '?').join(',');

  let sql = `SELECT * FROM compliance_metadata WHERE risk_level IN (${placeholders})`;
  const params: string[] = [...allowedRisks];

  if (since) {
    sql += ' AND created_at >= ?';
    params.push(since);
  }

  sql += ' ORDER BY created_at DESC LIMIT 500';

  const rows = await db.all<Record<string, unknown>>(sql, params);
  return rows.map(parseComplianceRow);
}

// ── Export ────────────────────────────────────────────

export async function exportComplianceReport(
  framework: RegulatoryFramework = 'EU AI Act',
  since?: string,
): Promise<ComplianceExport> {
  const db = await getLensDb();
  const now = new Date().toISOString();

  let sql = `SELECT cm.* FROM compliance_metadata cm
    WHERE EXISTS (SELECT 1 FROM json_each(cm.frameworks) WHERE json_each.value = ?)`;
  const params: string[] = [framework];

  if (since) {
    sql += ' AND cm.created_at >= ?';
    params.push(since);
  }

  sql += ' ORDER BY cm.created_at DESC LIMIT 2000';

  const rows = await db.all<Record<string, unknown>>(sql, params);
  const records = rows.map(parseComplianceRow);

  const sessions = new Set(records.map((r) => r.sessionId));
  const riskDist: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  const categories = new Set<DataCategory>();

  for (const r of records) {
    riskDist[r.riskLevel]++;
    for (const c of r.dataCategories) categories.add(c);
  }

  const timestamps = records.map((r) => r.createdAt).sort();

  const summary = {
    totalSessions: sessions.size,
    riskDistribution: riskDist,
    categoriesTouched: [...categories],
    dateRange: {
      from: timestamps[timestamps.length - 1] ?? now,
      to: timestamps[0] ?? now,
    },
  };

  // Mark records as exported
  await db.run(
    `UPDATE compliance_metadata SET exported_at = ? WHERE exported_at IS NULL`,
    [now],
  ).catch(() => {});

  return { exportedAt: now, framework, records, summary };
}

// ── Parsing ──────────────────────────────────────────

function parseComplianceRow(row: Record<string, unknown>): ComplianceRecord {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    turnId: (row.turn_id as string) || undefined,
    riskLevel: (row.risk_level as RiskLevel) || 'medium',
    dataCategories: parseJsonArray<DataCategory>(row.data_categories as string),
    frameworks: parseJsonArray<RegulatoryFramework>(row.frameworks as string),
    approver: (row.approver as string) || undefined,
    retentionDays: (row.retention_days as number) || 90,
    dataRegion: (row.data_region as string) || 'global',
    auditable: !!(row.auditable as number),
    auditSummary: (row.audit_summary as string) || undefined,
    context: row.context ? JSON.parse(row.context as string) : undefined,
    exportedAt: (row.exported_at as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function parseJsonArray<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

// ── Retention Enforcement ────────────────────────────

export async function enforceRetention(): Promise<number> {
  const db = await getLensDb();
  // Count before delete for the return value
  const before = await db.get<{ count: number }>(
    `SELECT COUNT(*) as count FROM compliance_metadata
     WHERE retention_days > 0
       AND datetime(created_at, '+' || retention_days || ' days') < datetime('now')`,
  );
  const count = before?.count ?? 0;
  await db.run(
    `DELETE FROM compliance_metadata
     WHERE retention_days > 0
       AND datetime(created_at, '+' || retention_days || ' days') < datetime('now')`,
  );
  return count;
}
