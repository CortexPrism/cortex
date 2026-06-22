import { listenMessages, VALIDATOR_SOCK } from '../ipc/transport.ts';
import type { IntentMessage, IntentResponseMessage, IpcMessage } from '../ipc/transport.ts';
import { checkPolicy } from '../../../../src/security/policy.ts';
import type { PolicyKind } from '../../../../src/security/policy.ts';
import { runMigrations } from '../../../../src/db/migrate.ts';
import { logEvent } from '../../../../src/db/lens.ts';

async function handleIntent(
  msg: IntentMessage,
  respond: (reply: IpcMessage) => Promise<void>,
): Promise<void> {
  const { id, sessionId, turnId, intent } = msg;
  const action = intent.action;
  const params = intent.params;

  const targetValue = (params.name as string) ??
    (params.path as string) ??
    (params.domain as string) ??
    action;

  const policyKind: PolicyKind = action.startsWith('shell')
    ? 'shell'
    : action.includes('domain') || action.includes('http')
    ? 'domain'
    : 'tool';

  const allowed = await checkPolicy(policyKind, targetValue);

  await logEvent({
    event_type: 'policy_check',
    session_id: sessionId,
    turn_id: turnId,
    actor: 'validator',
    action,
    summary: `${allowed ? 'APPROVED' : 'REJECTED'} intent ${id}: ${action}`,
    payload: JSON.stringify({ intentId: id, params, justification: intent.justification }),
    started_at: new Date().toISOString(),
  });

  if (allowed) {
    const response: IntentResponseMessage = {
      type: 'intent_response',
      id,
      status: 'approved',
      intent: { action, params },
      validatedAt: new Date().toISOString(),
    };
    await respond(response);
  } else {
    const response: IntentResponseMessage = {
      type: 'intent_response',
      id,
      status: 'rejected',
      rejection: {
        reason: 'POLICY_DENY',
        detail: `Action '${action}' on '${targetValue}' is denied by policy`,
      },
      validatedAt: new Date().toISOString(),
    };
    await respond(response);
  }
}

export async function runValidator(): Promise<void> {
  console.log('[validator] Starting Cortex Validator process...');
  Deno.env.set('CORTEX_NOLENS', '1');
  await runMigrations();
  console.log('[validator] Ready.');

  await listenMessages(VALIDATOR_SOCK, async (msg, respond) => {
    if (msg.type === 'heartbeat') {
      await respond({ type: 'heartbeat', id: msg.id });
      return;
    }

    if (msg.type === 'intent') {
      await handleIntent(msg as IntentMessage, respond);
      return;
    }

    await respond({
      type: 'error',
      id: msg.id,
      code: 'ERR_UNKNOWN_MESSAGE',
      message: `Unknown message type: ${msg.type}`,
    });
  });
}

if (import.meta.main) {
  await runValidator();
}
