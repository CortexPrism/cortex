import {
  EXECUTOR_SOCK,
  makeIntentId,
  pingProcess,
  sendMessage,
  VALIDATOR_SOCK,
} from './transport.ts';
import type {
  ExecuteMessage,
  ExecuteResultMessage,
  IntentMessage,
  IntentResponseMessage,
} from './transport.ts';

let _validatorAvailable: boolean | null = null;
let _lastCheck = 0;

async function isValidatorRunning(): Promise<boolean> {
  const now = Date.now();
  if (_validatorAvailable !== null && now - _lastCheck < 5_000) {
    return _validatorAvailable;
  }
  _validatorAvailable = await pingProcess(VALIDATOR_SOCK);
  _lastCheck = now;
  return _validatorAvailable;
}

export interface IntentResult {
  approved: boolean;
  action: string;
  params: Record<string, unknown>;
  rejectionReason?: string;
}

export async function submitIntent(opts: {
  sessionId: string;
  turnId: string;
  action: string;
  params: Record<string, unknown>;
  justification?: string;
  userMessage?: string;
}): Promise<IntentResult> {
  const available = await isValidatorRunning();

  if (!available) {
    return { approved: true, action: opts.action, params: opts.params };
  }

  const id = makeIntentId();
  const msg: IntentMessage = {
    type: 'intent',
    id,
    sessionId: opts.sessionId,
    turnId: opts.turnId,
    timestamp: new Date().toISOString(),
    intent: {
      action: opts.action,
      params: opts.params,
      justification: opts.justification,
    },
    context: {
      userMessage: opts.userMessage,
      riskLevel: 'low',
    },
  };

  const reply = await sendMessage(VALIDATOR_SOCK, msg) as IntentResponseMessage;

  if (reply.status === 'approved') {
    return {
      approved: true,
      action: reply.intent?.action ?? opts.action,
      params: reply.intent?.params ?? opts.params,
    };
  }

  return {
    approved: false,
    action: opts.action,
    params: opts.params,
    rejectionReason: reply.rejection?.detail,
  };
}

export async function executeViaProcess(opts: {
  sessionId: string;
  turnId: string;
  action: string;
  params: Record<string, unknown>;
}): Promise<{ success: boolean; content?: string; error?: string }> {
  const id = makeIntentId();
  const msg: ExecuteMessage = {
    type: 'execute',
    id,
    sessionId: opts.sessionId,
    turnId: opts.turnId,
    intent: { action: opts.action, params: opts.params },
    approval: { approvedAt: new Date().toISOString() },
  };

  try {
    const reply = await sendMessage(EXECUTOR_SOCK, msg) as ExecuteResultMessage;
    if (reply.status === 'success') {
      return { success: true, content: reply.result?.content };
    }
    return { success: false, error: reply.error?.message };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}
