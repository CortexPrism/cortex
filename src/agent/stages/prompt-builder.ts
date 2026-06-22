import { injectMemory } from '../../memory/inject.ts';
import { bridgeSessionContext } from '../../memory/context-bridge.ts';
import { findMatchingSkills, filterReliableSkills, formatSkillsForPrompt } from '../../memory/skills.ts';
import { buildPreferenceContext } from '../../memory/preference-learner.ts';
import { applyMetaCogPrefix } from '../metacog.ts';
import { injectToolsIntoPrompt } from '../../tools/executor.ts';
import { buildNodeContextSection, injectNodeContext } from '../node-context.ts';
import { i18n } from '../../i18n/service.ts';
import type { TurnContext } from '../pipeline/context.ts';

export const FALLBACK_SYSTEM_PROMPT =
  'You are Cortex, an intelligent agentic assistant. Be helpful, precise, and honest.';

export async function buildPrompt(ctx: TurnContext): Promise<void> {
  const { options, effectiveInput } = ctx;
  const { registry, toolCtx } = ctx;
  const systemPrompt = options.systemPrompt || FALLBACK_SYSTEM_PROMPT;
  const metaAssessment = ctx.metaAssessment;

  const memoryEnrichedPrompt = await injectMemory(
    systemPrompt,
    effectiveInput,
    options.embedder ?? null,
  )
    .catch(() => systemPrompt);

  let enrichedPrompt = memoryEnrichedPrompt;

  try {
    const prefCtx = await buildPreferenceContext();
    if (prefCtx) {
      enrichedPrompt += '\n\n---\n\n' + prefCtx;
    }
  } catch { /* preference context may fail */ }

  try {
    const bridgeResult = await bridgeSessionContext(
      Deno.cwd(),
      effectiveInput,
      3,
      30,
    );
    if (bridgeResult.preloadPrompt) {
      enrichedPrompt += '\n\n---\n\n' + bridgeResult.preloadPrompt;
    }
  } catch { /* context bridge may fail */ }

  try {
    const skills = await findMatchingSkills(effectiveInput, 3, options.embedder ?? null);
    const reliable = filterReliableSkills(skills);
    if (reliable.length > 0) {
      enrichedPrompt += formatSkillsForPrompt(reliable);
    }
  } catch { /* skills query may fail */ }

  const metaCogPrompt = applyMetaCogPrefix(metaAssessment, enrichedPrompt);

  const effectiveSystemPrompt = registry && toolCtx
    ? injectToolsIntoPrompt(metaCogPrompt, registry.definitions())
    : metaCogPrompt;

  const nodeSection = await buildNodeContextSection().catch(() => null);
  let nodeAwareSystemPrompt = injectNodeContext(effectiveSystemPrompt, nodeSection);

  const locale = i18n.getLocale();
  if (locale && locale !== 'en') {
    nodeAwareSystemPrompt += '\n' + i18n.t('agent.prompts.localeHint', { locale });
  }

  ctx.effectiveSystemPrompt = effectiveSystemPrompt;
  ctx.nodeAwareSystemPrompt = nodeAwareSystemPrompt;
}
