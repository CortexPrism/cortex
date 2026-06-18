/**
 * LLM Supervisor System
 *
 * Uses a lightweight supervisor LLM to approve/deny access to sensitive data.
 * Integrates with Model Quartermaster for intelligent model selection.
 */

import { loadConfig } from '../config/config.ts';
import type { ProviderKind } from '../config/config.ts';
import { buildProviderFromConfig } from '../llm/router.ts';
import type { LLMProvider } from '../llm/types.ts';
import type { SensitivityLevel } from './classification.ts';

export interface AccessRequest {
  tool: string; // e.g., "db_query", "memory_search"
  query: string; // The actual query/search
  requestReason?: string; // Agent's justification (from tool args)
  sessionId: string;
  agentId: string;
  dataClassification: SensitivityLevel;
  sampleData?: string; // Snippet of what would be returned (for context)
}

export interface AccessDecision {
  allowed: boolean;
  reason: string;
  confidence: number;
  redactions?: string[]; // Fields to redact if partially allowed
  expiresAt?: string; // Temporary grant timestamp
  requiresHuman: boolean; // Escalate to human approval
}

/**
 * Session-based decision cache (1-hour TTL per plan)
 * Key: `${sessionId}:${tool}:${queryHash}`
 */
interface CachedDecision {
  decision: AccessDecision;
  expiresAt: number;
}

const decisionCache = new Map<string, CachedDecision>();

/**
 * Simple hash function for cache keys
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Get cached decision if available and not expired
 */
function getCachedDecision(
  sessionId: string,
  tool: string,
  query: string,
): AccessDecision | null {
  const key = `${sessionId}:${tool}:${hashString(query)}`;
  const cached = decisionCache.get(key);

  if (!cached) return null;

  // Check expiration
  if (Date.now() > cached.expiresAt) {
    decisionCache.delete(key);
    return null;
  }

  return cached.decision;
}

/**
 * Cache a decision for the session (1-hour TTL)
 */
function cacheDecision(
  sessionId: string,
  tool: string,
  query: string,
  decision: AccessDecision,
): void {
  const key = `${sessionId}:${tool}:${hashString(query)}`;
  const ttl = 60 * 60 * 1000; // 1 hour in ms
  decisionCache.set(key, {
    decision,
    expiresAt: Date.now() + ttl,
  });
}

/**
 * Use Model Quartermaster or config default to select optimal supervisor model
 * Prefer fast, cheap models (gemini-2.0-flash, gpt-4o-mini, claude-3.5-haiku)
 */
async function selectSupervisorModel(): Promise<{ provider: ProviderKind; model: string }> {
  const config = await loadConfig();

  if (config.modelSelection?.enabled) {
    try {
      const { buildRequestContext, getCandidateModels, ModelArbiter } = await import(
        '../model-quartermaster/mod.ts'
      );
      const candidates = getCandidateModels(config.providers);
      if (candidates.length > 0) {
        const arbiter = new ModelArbiter({
          mode: config.modelSelection.mode,
          costBudgetUsd: config.modelSelection.costBudget,
          qualityThreshold: config.modelSelection.qualityThreshold,
          allowedProviders: config.modelSelection.allowedProviders,
          enforceConfidence: config.modelSelection.enforceConfidence,
          suggestConfidence: config.modelSelection.suggestConfidence,
        });
        const prediction = await arbiter.decide(
          buildRequestContext('Security supervisor model selection', undefined, [], 0, [
            'memory_search',
            'db_query',
          ]),
          candidates,
          'supervisor',
          'supervisor',
        );
        if (prediction.predictedProvider && prediction.predictedModel) {
          return {
            provider: prediction.predictedProvider,
            model: prediction.predictedModel,
          };
        }
      }
    } catch {
      // Fall back to deterministic selection below.
    }
  }

  // For now, use config default or hardcoded fallback to fast/cheap models
  // Priority order: gemini-2.0-flash > gpt-4o-mini > claude-3.5-haiku

  // Check if Google provider is available with Gemini 2.0 Flash
  if (config.providers.google?.apiKey) {
    return {
      provider: 'google',
      model: 'gemini-2.0-flash-exp',
    };
  }

  // Check if OpenAI provider is available with GPT-4o Mini
  if (config.providers.openai?.apiKey) {
    return {
      provider: 'openai',
      model: 'gpt-4o-mini',
    };
  }

  // Check if Anthropic provider is available with Claude 3.5 Haiku
  if (config.providers.anthropic?.apiKey) {
    return {
      provider: 'anthropic',
      model: 'claude-3-5-haiku-20241022',
    };
  }

  // Fallback to config default
  return {
    provider: config.defaultProvider,
    model: config.providers[config.defaultProvider]?.model ?? 'gpt-4o-mini',
  };
}

/**
 * Create an LLM provider instance for the supervisor
 */
async function getSupervisorLLM(): Promise<{ provider: LLMProvider; model: string }> {
  const { provider: providerKind, model } = await selectSupervisorModel();
  const config = await loadConfig();

  const providerConfig = config.providers[providerKind];
  if (!providerConfig) {
    throw new Error(`Provider ${providerKind} not configured`);
  }

  const provider = buildProviderFromConfig(providerKind, providerConfig);
  return { provider, model };
}

/**
 * Query the supervisor LLM for access decision
 */
export async function requestSupervisorDecision(req: AccessRequest): Promise<AccessDecision> {
  // Check cache first
  const cached = getCachedDecision(req.sessionId, req.tool, req.query);
  if (cached) {
    return cached;
  }

  const { provider, model } = await getSupervisorLLM();

  const prompt =
    `You are a security supervisor for an AI agent system. An agent is requesting access to ${req.dataClassification.toUpperCase()} data.

**Request Details:**
- Agent ID: ${req.agentId}
- Tool: ${req.tool}
- Query/Search: ${req.query}
- Justification: ${req.requestReason ?? '(none provided)'}
- Data Classification: ${req.dataClassification}
${req.sampleData ? `- Sample Data: ${req.sampleData}` : ''}

**Your Task:**
Decide whether this access should be allowed. Consider:
1. Is the agent's justification legitimate and specific?
2. Does the task genuinely require this data?
3. Could the agent accomplish the goal without accessing ${req.dataClassification} data?
4. Is there a risk of the agent leaking or misusing this data?
5. For SECRET data: human approval is REQUIRED unless the request is unambiguously safe.

**Response Format (JSON):**
{
  "allowed": boolean,
  "reason": "1-2 sentence explanation",
  "confidence": number,  // 0.0-1.0
  "redactions": ["field1", "field2"],  // optional: redact these fields if partially allowed
  "requiresHuman": boolean  // true if uncertain or SECRET data
}

Respond ONLY with valid JSON.`;

  try {
    // Call the supervisor model with low temperature for consistent decisions
    const response = await provider.complete({
      messages: [{ role: 'user', content: prompt }],
      model,
      temperature: 0.3,
      maxTokens: 300,
    });

    // Parse JSON response
    const decision = JSON.parse(response.content.trim()) as AccessDecision;

    // Force human approval for SECRET tier or low confidence
    if (req.dataClassification === 'secret' || decision.confidence < 0.7) {
      decision.requiresHuman = true;
    }

    // Cache the decision
    cacheDecision(req.sessionId, req.tool, req.query, decision);

    // Log supervisor decision (for audit)
    console.log(
      `🛡️ Supervisor decision: ${
        decision.allowed ? 'ALLOW' : 'DENY'
      } ${req.tool} (confidence: ${decision.confidence})`,
    );

    return decision;
  } catch (error) {
    // On error, default to DENY with human escalation
    console.error('❌ Supervisor LLM error:', error);
    return {
      allowed: false,
      reason: 'Supervisor LLM failed to respond',
      confidence: 0,
      requiresHuman: true,
    };
  }
}

/**
 * Check if access request requires supervisor approval
 */
export function requiresSupervisorApproval(level: SensitivityLevel): boolean {
  return level === 'sensitive' || level === 'secret';
}

/**
 * Get decision cache entries (for UI inspection)
 */
export function getDecisionCacheEntries(): Array<{
  key: string;
  allowed: boolean;
  confidence: number;
  expiresAt: string;
}> {
  const entries: Array<{ key: string; allowed: boolean; confidence: number; expiresAt: string }> =
    [];
  for (const [key, cached] of decisionCache) {
    entries.push({
      key,
      allowed: cached.decision.allowed,
      confidence: cached.decision.confidence,
      expiresAt: new Date(cached.expiresAt).toISOString(),
    });
  }
  return entries;
}

/**
 * Clear decision cache (for testing or manual reset)
 */
export function clearDecisionCache(): void {
  decisionCache.clear();
}
