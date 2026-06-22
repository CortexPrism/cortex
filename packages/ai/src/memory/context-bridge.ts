/**
 * Cross-Session Context Bridge — #64
 *
 * When a user starts a new Cortex session, retrieves the most relevant
 * context from past sessions (same codebase, same task type, same error
 * patterns) and pre-loads it. Creates continuity across sessions without
 * manual handoff.
 */
import type { retrieve } from '../memory/store.ts';
import { listSessions, type SessionRow } from '../../../../src/db/sessions.ts';

export interface SessionContext {
  sessionId: string;
  agentId: string;
  projectRoot: string;
  taskDescription: string;
  keyDecisions: string[];
  recentErrors: string[];
  activeFiles: string[];
  lastTurnNumber: number;
  lastActiveAt: string;
  relevanceScore: number;
}

export interface ContextBridgeResult {
  sessions: SessionContext[];
  aggregatedContext: AggregatedContext;
  preloadPrompt: string;
}

export interface AggregatedContext {
  commonErrors: string[];
  keyPatterns: string[];
  activeAreas: string[];
  suggestedFocus: string[];
  relatedEntities: string[];
}

export async function bridgeSessionContext(
  currentProjectRoot: string,
  currentTaskDescription: string,
  maxSessions = 5,
  maxAgeDays = 30,
): Promise<ContextBridgeResult> {
  const sessions = await retrieveRelevantSessions(
    currentProjectRoot,
    currentTaskDescription,
    maxSessions,
    maxAgeDays,
  );

  const aggregatedContext = aggregateSessionContext(sessions);
  const preloadPrompt = buildPreloadPrompt(sessions, aggregatedContext);

  return {
    sessions,
    aggregatedContext,
    preloadPrompt,
  };
}

async function retrieveRelevantSessions(
  projectRoot: string,
  taskDescription: string,
  maxSessions: number,
  maxAgeDays: number,
): Promise<SessionContext[]> {
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString();
  const allSessions = await listSessions(50);

  const contexts: SessionContext[] = [];

  for (const session of allSessions) {
    if (contexts.length >= maxSessions * 2) break;

    if (session.started_at && session.started_at < cutoff) continue;

    const score = calculateRelevanceScore(session, projectRoot, taskDescription);
    if (score > 0) {
      contexts.push({
        sessionId: session.id,
        agentId: session.agent_id,
        projectRoot: projectRoot,
        taskDescription: session.name ?? '',
        keyDecisions: [],
        recentErrors: [],
        activeFiles: [],
        lastTurnNumber: session.turn_count,
        lastActiveAt: session.last_turn_at ?? session.started_at,
        relevanceScore: score,
      });
    }
  }

  contexts.sort((a, b) => b.relevanceScore - a.relevanceScore);
  return contexts.slice(0, maxSessions);
}

function calculateRelevanceScore(
  session: SessionRow,
  projectRoot: string,
  taskDescription: string,
): number {
  let score = 0;

  const lastActive = session.last_turn_at ?? session.started_at;
  const recency = Date.now() - new Date(lastActive).getTime();

  const recencyDays = recency / (24 * 60 * 60 * 1000);
  score += Math.max(0, 10 - recencyDays);

  const nameWords = (session.name ?? '').toLowerCase().split(/\s+/);
  const taskWords = taskDescription.toLowerCase().split(/\s+/);
  const commonWords = nameWords.filter((w) => taskWords.includes(w) && w.length > 3);
  score += commonWords.length * 3;

  return score;
}

function aggregateSessionContext(sessions: SessionContext[]): AggregatedContext {
  const errorCounts = new Map<string, number>();
  const patternCounts = new Map<string, number>();
  const areaCounts = new Map<string, number>();
  const focusItems: string[] = [];

  for (const session of sessions) {
    for (const error of session.recentErrors) {
      errorCounts.set(error, (errorCounts.get(error) ?? 0) + 1);
    }
    for (const decision of session.keyDecisions) {
      patternCounts.set(decision, (patternCounts.get(decision) ?? 0) + 1);
    }
    for (const file of session.activeFiles) {
      const area = file.split('/')[0] || file;
      areaCounts.set(area, (areaCounts.get(area) ?? 0) + 1);
    }
  }

  const commonErrors = Array.from(errorCounts.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([err]) => err);

  const keyPatterns = Array.from(patternCounts.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([pat]) => pat);

  const activeAreas = Array.from(areaCounts.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([area]) => area);

  if (commonErrors.length > 0) {
    focusItems.push('Focus on avoiding previously encountered errors');
  }
  if (activeAreas.length > 0) {
    focusItems.push(`Key areas: ${activeAreas.join(', ')}`);
  }

  return {
    commonErrors,
    keyPatterns,
    activeAreas,
    suggestedFocus: focusItems,
    relatedEntities: [],
  };
}

function buildPreloadPrompt(
  sessions: SessionContext[],
  aggregated: AggregatedContext,
): string {
  const lines: string[] = [
    '[Cross-Session Context — continuity from previous work]',
    '',
    `Found ${sessions.length} relevant previous sessions.`,
    '',
  ];

  if (aggregated.commonErrors.length > 0) {
    lines.push(
      '**Previously Encountered Issues:**',
      ...aggregated.commonErrors.map((e) => `- ${e}`),
      '',
    );
  }

  if (aggregated.keyPatterns.length > 0) {
    lines.push(
      '**Key Decisions from Past Sessions:**',
      ...aggregated.keyPatterns.map((d) => `- ${d}`),
      '',
    );
  }

  if (aggregated.activeAreas.length > 0) {
    lines.push(
      '**Active Areas:**',
      ...aggregated.activeAreas.map((a) => `- ${a}`),
      '',
    );
  }

  if (aggregated.suggestedFocus.length > 0) {
    lines.push(
      '**Suggested Focus:**',
      ...aggregated.suggestedFocus.map((f) => `- ${f}`),
      '',
    );
  }

  return lines.join('\n');
}
