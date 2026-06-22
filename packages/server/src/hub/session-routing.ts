import { logEvent } from '../../../../src/db/lens.ts';

export interface NodeResultEvent {
  directiveId: string;
  sessionId: string;
  nodeId: string;
  success: boolean;
  output: string;
  error?: string;
  durationMs: number;
  ts: string;
}

type ResultHandler = (event: NodeResultEvent) => void | Promise<void>;

const directiveSessionMap = new Map<string, { sessionId: string; nodeId: string }>();
const resultHandlers = new Set<ResultHandler>();

export function registerPending(directiveId: string, sessionId: string, nodeId: string): void {
  directiveSessionMap.set(directiveId, { sessionId, nodeId });
}

export function cancelPending(directiveId: string): void {
  directiveSessionMap.delete(directiveId);
}

export function getSessionForDirective(directiveId: string): string | undefined {
  return directiveSessionMap.get(directiveId)?.sessionId;
}

export function routeResult(
  directiveId: string,
  result: { success: boolean; output: string; error?: string; durationMs: number },
): void {
  const entry = directiveSessionMap.get(directiveId);
  if (!entry) return;

  directiveSessionMap.delete(directiveId);

  const event: NodeResultEvent = {
    directiveId,
    sessionId: entry.sessionId,
    nodeId: entry.nodeId,
    success: result.success,
    output: result.output,
    error: result.error,
    durationMs: result.durationMs,
    ts: new Date().toISOString(),
  };

  for (const handler of resultHandlers) {
    try {
      handler(event);
    } catch { /* don't break the chain */ }
  }

  logEvent({
    event_type: 'node_result_routed',
    session_id: entry.sessionId,
    actor: entry.nodeId,
    action: 'result_routed',
    summary: `Node result for directive ${directiveId} routed to session ${entry.sessionId}`,
    started_at: event.ts,
    payload: { directiveId, nodeId: entry.nodeId, success: result.success },
    duration_ms: result.durationMs,
  }).catch(() => {});
}

export function onNodeResult(handler: ResultHandler): void {
  resultHandlers.add(handler);
}

export function offNodeResult(handler: ResultHandler): void {
  resultHandlers.delete(handler);
}
