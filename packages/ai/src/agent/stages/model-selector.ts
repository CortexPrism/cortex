import { logger } from '../../../../../src/utils/logger.ts';
import { createPipelineContext, runHooksForStage } from '../../pipeline/manager.ts';
import type { ProviderKind } from '../../../../../src/config/config.ts';
import type { TurnContext } from '../pipeline/context.ts';

const _log = logger('agent:loop');

export async function selectModel(ctx: TurnContext): Promise<{ aborted: boolean }> {
  const { options, config, turnId, effectiveInput, state } = ctx;
  const { sessionId } = options;
  const started = ctx.started;

  let effectiveProvider = ctx.effectiveProvider;
  let effectiveModel = ctx.effectiveModel;
  let mqmPredictedProviderKind: string | undefined;

  if (config?.modelSelection?.enabled) {
    const mqmPreLlmCtx = createPipelineContext({
      stage: 'pre-llm',
      sessionId,
      turnId,
      state: { ...state, tokensUsed: ctx.tokensIn + ctx.tokensOut, costUsd: ctx.costUsd },
      input: effectiveInput,
      assessment: ctx.metaAssessment,
    });
    const mqmPreLlmResult = await runHooksForStage('pre-llm', mqmPreLlmCtx);
    if (mqmPreLlmResult.aborted) {
      ctx.result = {
        response: mqmPreLlmResult.abortMessage || 'Request blocked',
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        turnId,
        durationMs: Date.now() - started,
      };
      return { aborted: true };
    }

    const predictedState = mqmPreLlmCtx.state as Record<string, unknown>;
    mqmPredictedProviderKind = predictedState.mqmPredictedProvider as string | undefined;
    if (
      predictedState.mqmPredictionMode === 'enforce' &&
      typeof predictedState.mqmPredictedProvider === 'string' &&
      typeof predictedState.mqmPredictedModel === 'string'
    ) {
      try {
        const { buildProviderFromConfig } = await import('../../llm/router.ts');
        const { loadConfig: lc } = await import('../../../../../src/config/config.ts');
        const cfg = await lc();
        const predictedProvider = predictedState.mqmPredictedProvider as ProviderKind;
        const predictedModel = predictedState.mqmPredictedModel as string;
        const providerCfg = cfg.providers[predictedProvider];
        if (providerCfg) {
          effectiveProvider = buildProviderFromConfig(predictedProvider, providerCfg);
          effectiveModel = predictedModel;
          if (state.mqmPredictionConfidence) {
            _log.info(
              `MQM: Using ${predictedProvider}/${predictedModel} (confidence: ${
                (predictedState.mqmPredictionConfidence as number).toFixed(2)
              })`,
            );
          }
        }
      } catch {
        // Provider build failed, fall through to default
      }
    }
  }

  ctx.effectiveProvider = effectiveProvider;
  ctx.effectiveModel = effectiveModel;
  ctx.mqmPredictedProviderKind = mqmPredictedProviderKind;

  return { aborted: false };
}
