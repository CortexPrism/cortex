import type {
  HookRegistration,
  HookResult,
  PipelineContext,
  PipelineHook,
  PipelineStage,
} from './types.ts';

const HOOK_TIMEOUT_MS = 5_000;
const ASYNC_HOOK_TIMEOUT_MS = 15_000;

const registrations: HookRegistration[] = [];

export function registerHook(
  hook: PipelineHook,
  source: 'core' | 'plugin' = 'core',
  pluginName?: string,
): void {
  const existing = registrations.findIndex((r) => r.hook.name === hook.name);
  if (existing !== -1) {
    registrations.splice(existing, 1);
  }
  registrations.push({ hook, source, pluginName });
}

export function unregisterHook(name: string): boolean {
  const idx = registrations.findIndex((r) => r.hook.name === name);
  if (idx === -1) return false;
  registrations.splice(idx, 1);
  return true;
}

export function unregisterAllForPlugin(pluginName: string): void {
  for (let i = registrations.length - 1; i >= 0; i--) {
    if (registrations[i].pluginName === pluginName) {
      registrations.splice(i, 1);
    }
  }
}

export function getHooksForStage(stage: PipelineStage): { hook: PipelineHook; source: 'core' | 'plugin' }[] {
  const stageHooks = registrations
    .filter((r) => r.hook.stages.includes(stage))
    .sort((a, b) => a.hook.priority - b.hook.priority);
  return stageHooks.map((r) => ({ hook: r.hook, source: r.source }));
}

export function listHooks(): HookRegistration[] {
  return [...registrations];
}

export function getHookCount(): number {
  return registrations.length;
}

async function runHookWithTimeout(
  hook: PipelineHook,
  ctx: PipelineContext,
): Promise<HookResult> {
  const timeout = hook.async ? ASYNC_HOOK_TIMEOUT_MS : HOOK_TIMEOUT_MS;

  try {
    const result = await Promise.race([
      hook.run(ctx),
      new Promise<HookResult>((_, reject) =>
        setTimeout(() => reject(new Error(`Hook ${hook.name} timed out after ${timeout}ms`)), timeout)
      ),
    ]);
    return result;
  } catch (e) {
    console.error(`[pipeline] Hook ${hook.name} failed: ${(e as Error).message}`);
    return {};
  }
}

export async function runHooksForStage(
  stage: PipelineStage,
  ctx: PipelineContext,
): Promise<{
  output: PipelineContext;
  aborted: boolean;
  abortReason?: string;
  abortMessage?: string;
}> {
  const stageHooks = getHooksForStage(stage);

  for (const { hook } of stageHooks) {
    if (hook.async) {
      runHookWithTimeout(hook, ctx).catch(() => {});
      continue;
    }

    const result = await runHookWithTimeout(hook, ctx);

    if (result.abort) {
      return {
        output: ctx,
        aborted: true,
        abortReason: result.abort.reason,
        abortMessage: result.abort.message,
      };
    }

    applyResult(ctx, result, stage);
  }

  return { output: ctx, aborted: false };
}

function applyResult(ctx: PipelineContext, result: HookResult, _stage: PipelineStage): void {
  if (result.modifyInput !== undefined && ctx.stage === 'pre-assess') {
    (ctx as { input?: string }).input = result.modifyInput;
  }
  if (result.modifyLLMResponse !== undefined) {
    (ctx as { currentLLMResponse?: string }).currentLLMResponse = result.modifyLLMResponse;
  }
  if (result.modifyOutput !== undefined) {
    (ctx as { output?: string }).output = result.modifyOutput;
  }

  if (result.sideEffects) {
    for (const se of result.sideEffects) {
      switch (se.type) {
        case 'log':
          console.log(`[hook:${ctx.sessionId}] ${JSON.stringify(se.payload)}`);
          break;
        case 'metric':
          break;
        case 'store':
          break;
        case 'notify':
          break;
      }
    }
  }
}

export function createPipelineContext(overrides: Partial<PipelineContext> & {
  stage: PipelineStage;
  sessionId: string;
  turnId: string;
  state: PipelineContext['state'];
}): PipelineContext {
  const internalState = { ...overrides.state };
  return {
    stage: overrides.stage,
    sessionId: overrides.sessionId,
    turnId: overrides.turnId,
    input: overrides.input,
    assessment: overrides.assessment,
    messages: overrides.messages,
    currentLLMResponse: overrides.currentLLMResponse,
    toolCall: overrides.toolCall,
    toolResult: overrides.toolResult,
    reflection: overrides.reflection,
    output: overrides.output,
    state: internalState,
    setState(updates) {
      Object.assign(internalState, updates);
    },
  };
}
