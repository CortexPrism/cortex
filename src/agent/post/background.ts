import { logger } from '../../utils/logger.ts';
import { getActiveBackend } from '../../memory/backends.ts';
import { extractAndStoreEntities } from '../../memory/graph.ts';
import { adversarialReflection, reflectOnTurn, storeReflection } from '../reflect.ts';
import { extractSkillFromSession } from '../../memory/skills.ts';
import { detectAndPersistPreference } from '../helpers/preferences.ts';
import type { TurnContext } from '../pipeline/context.ts';

const _log = logger('agent:loop');

export function fireBackgroundTasks(ctx: TurnContext): void {
  const { options } = ctx;
  const { sessionId, userMessage } = options;
  const turnId = ctx.turnId;
  const response = ctx.response;
  const effectiveProvider = ctx.effectiveProvider;
  const effectiveModel = ctx.effectiveModel;
  const collectedToolCalls = ctx.collectedToolCalls;

  const episodicSummary = `User: ${userMessage.slice(0, 200)}\nAssistant: ${
    (response || '(error)').slice(0, 200)
  }`;

  (async () => {
    try {
      await Promise.allSettled([
        getActiveBackend().write({
          sessionId,
          summary: episodicSummary,
          importance: Math.min(1.0, 0.3 + (userMessage.length / 500)),
          embedder: options.embedder,
        }),
        extractAndStoreEntities(`${userMessage} ${response}`, sessionId),
        detectAndPersistPreference(userMessage, sessionId),
      ]);

      if (options.enableReflection && response) {
        try {
          const r = await reflectOnTurn(
            userMessage,
            response,
            effectiveProvider,
            effectiveModel,
            options.reasoningEffort,
          );
          await storeReflection(sessionId, r);
          if (collectedToolCalls.length > 0) {
            const { learn } = await import('../../quartermaster/mod.ts');
            learn({
              sessionId,
              turnId,
              reflection: r,
              actualToolCalls: collectedToolCalls.map((t) => t.tool),
            }).catch(() => {});
          }

          const adv = await adversarialReflection(
            userMessage,
            response,
            effectiveProvider,
            effectiveModel,
            options.reasoningEffort,
          );
          await storeReflection(sessionId, adv, 'adversarial');
        } catch (reflectionErr) {
          _log.warn('Reflection failed', {
            error: (reflectionErr as Error).message,
            sessionId,
            turnId,
          });
        }
      }
    } catch (bgErr) {
      _log.warn('Background operations failed', {
        error: (bgErr as Error).message,
        sessionId,
        turnId,
      });
    }
  })().catch(() => {});

  if (collectedToolCalls.length >= 4) {
    extractSkillFromSession(
      sessionId,
      userMessage.slice(0, 300),
      collectedToolCalls,
      options.provider,
      options.model,
    ).then(async (skillId) => {
      if (skillId && options.embedder) {
        const { deduplicateExtractedSkill } = await import('../../memory/skills.ts');
        deduplicateExtractedSkill(skillId, options.embedder).catch(() => {});
      }
    }).catch(() => {});
  }
}
