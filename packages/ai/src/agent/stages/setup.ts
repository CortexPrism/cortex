import { logger } from '../../../../../src/utils/logger.ts';
import { createPipelineContext, runHooksForStage } from '../../pipeline/manager.ts';
import { registerBuiltinHooks } from '../../pipeline/builtin.ts';
import { nanoid } from '../helpers/nanoid.ts';
import { persistMessage } from './history.ts';
import type { AgentTurnOptions } from '../types.ts';
import type { TurnContext } from '../pipeline/context.ts';

const _log = logger('agent:loop');

let builtinHooksRegistered = false;

export const DEFAULT_MAX_TOOL_ROUNDS = 12;

export const SUB_AGENT_TIMEOUT_MS = 120_000;
export const STREAM_TIMEOUT_MS = 180_000;

export async function runSetup(options: AgentTurnOptions): Promise<TurnContext> {
  const turnId = nanoid();
  const started = Date.now();
  const startedAt = new Date(started).toISOString();

  _log.info(`Agent turn starting`, {
    turnId,
    sessionId: options.sessionId,
    messageLength: options.userMessage.length,
  });

  if (!builtinHooksRegistered) {
    _log.debug(`Registering builtin hooks`, { turnId });
    registerBuiltinHooks();
    try {
      const { registerVoicePipelineHook } = await import('../../../../../src/voice/pipeline.ts');
      registerVoicePipelineHook();
      _log.debug(`Voice pipeline hook registered`, { turnId });
    } catch {
      _log.debug(`Voice module not available`, { turnId });
    }
    builtinHooksRegistered = true;
  }

  const { loadConfig } = await import('../../../../../src/config/config.ts');
  const config = await loadConfig();
  _log.debug(`Config loaded`, { turnId, hasModelSelection: !!config?.modelSelection?.enabled });

  const {
    userMessage,
    sessionDb,
    sessionId,
  } = options;

  let effectiveInput = userMessage;

  const state = {
    sessionId,
    turnId,
    tokensUsed: 0,
    costUsd: 0,
    toolCallsMade: 0,
    startedAt,
    userMessage,
    model: options.model,
  };

  const preAssessCtx = createPipelineContext({
    stage: 'pre-assess',
    sessionId,
    turnId,
    state,
    input: userMessage,
    messages: [],
  });

  _log.debug(`Running pre-assess hooks`, { turnId });
  const preAssessResult = await runHooksForStage('pre-assess', preAssessCtx);
  if (preAssessResult.aborted) {
    _log.warn(`Pre-assess aborted`, { turnId, reason: preAssessResult.abortMessage });
    const result = {
      response: preAssessResult.abortMessage || 'Request blocked',
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      turnId,
      durationMs: Date.now() - started,
    };
    const ctx: TurnContext = {
      options,
      turnId,
      started,
      config,
      effectiveInput,
      state,
      messages: [],
      maxToolRounds: options.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS,
      response: '',
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      errorMsg: undefined,
      hitToolCeiling: false,
      registry: undefined,
      toolCtx: undefined,
      metaAssessment: undefined!,
      hasDocumentContext: false,
      effectiveSystemPrompt: '',
      nodeAwareSystemPrompt: '',
      effectiveProvider: options.provider,
      effectiveModel: options.model,
      mqmPredictedProviderKind: undefined,
      collectedToolCalls: [],
      subAgentTimeoutMs: SUB_AGENT_TIMEOUT_MS,
      streamTimeoutMs: STREAM_TIMEOUT_MS,
      overallTimer: undefined,
      aborted: true,
      result,
    };
    return ctx;
  }
  effectiveInput = preAssessCtx.input ?? effectiveInput;
  _log.debug(`Pre-assess completed`, { turnId, inputModified: effectiveInput !== userMessage });

  if (options.persistUserMessage !== false) {
    await persistMessage(sessionDb, 'user', effectiveInput);
  }

  import('../../../../../src/quartermaster/mod.ts').then(({ recordUserMessage }) => {
    recordUserMessage(sessionId, effectiveInput);
  }).catch(() => {});

  const maxToolRounds = options.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;

  const registry = options.registry;
  const toolCtx = registry && options.toolContext
    ? { ...options.toolContext, sessionId }
    : undefined;
  _log.debug(`Starting main loop`, {
    turnId,
    maxToolRounds,
    hasTools: !!registry,
    hasToolCtx: !!toolCtx,
  });

  const result: import('../types.ts').AgentTurnResult = {
    response: '',
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    turnId,
    durationMs: 0,
  };

  const ctx: TurnContext = {
    options,
    turnId,
    started,
    config,
    effectiveInput,
    state,
    messages: [],
    maxToolRounds,
    response: '',
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    errorMsg: undefined,
    hitToolCeiling: false,
    registry,
    toolCtx,
    metaAssessment: undefined!,
    hasDocumentContext: false,
    effectiveSystemPrompt: '',
    nodeAwareSystemPrompt: '',
    effectiveProvider: options.provider,
    effectiveModel: options.model,
    mqmPredictedProviderKind: undefined,
    collectedToolCalls: [],
    subAgentTimeoutMs: SUB_AGENT_TIMEOUT_MS,
    streamTimeoutMs: STREAM_TIMEOUT_MS,
    overallTimer: undefined,
    aborted: false,
    result,
  };

  return ctx;
}
