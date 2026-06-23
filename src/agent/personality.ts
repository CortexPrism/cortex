/**
 * HEXACO Personality System
 *
 * Six-factor model (0.0–1.0 each):
 *   H — Honesty-Humility
 *   E — Emotionality
 *   X — eXtraversion
 *   A — Agreeableness
 *   C — Conscientiousness
 *   O — Openness to Experience
 *
 * Integration points:
 *   1. System prompt injection    — buildPersonalityPrompt()
 *   2. Memory retrieval bias      — getMemoryBiasWeights()
 *   3. Response style hints       — buildResponseStyleHints()
 *   4. MQM routing signal         — getMqmPersonalityHints()
 */

export interface HexacoPersonality {
  /** Honesty-Humility: sincerity, fairness, greed-avoidance (0=low, 1=high) */
  h: number;
  /** Emotionality: fearfulness, anxiety, sentimentality (0=low, 1=high) */
  e: number;
  /** eXtraversion: social self-esteem, liveliness, social boldness (0=low, 1=high) */
  x: number;
  /** Agreeableness: forgiveness, gentleness, flexibility (0=low, 1=high) */
  a: number;
  /** Conscientiousness: organisation, diligence, perfectionism (0=low, 1=high) */
  c: number;
  /** Openness to Experience: aesthetic appreciation, curiosity, creativity (0=low, 1=high) */
  o: number;
}

export const NEUTRAL_PERSONALITY: HexacoPersonality = {
  h: 0.5,
  e: 0.5,
  x: 0.5,
  a: 0.5,
  c: 0.5,
  o: 0.5,
};

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function level(v: number): 'very low' | 'low' | 'moderate' | 'high' | 'very high' {
  if (v < 0.2) return 'very low';
  if (v < 0.4) return 'low';
  if (v < 0.6) return 'moderate';
  if (v < 0.8) return 'high';
  return 'very high';
}

/**
 * Build a natural-language paragraph that is injected near the top of the
 * system prompt to shape the agent's voice and behaviour.
 */
export function buildPersonalityPrompt(p: HexacoPersonality): string {
  const h = clamp(p.h), e = clamp(p.e), x = clamp(p.x);
  const a = clamp(p.a), c = clamp(p.c), o = clamp(p.o);

  const traits: string[] = [];

  // Honesty-Humility
  if (h >= 0.7) traits.push('You are deeply honest, transparent, and avoid flattery or deception.');
  else if (h <= 0.3) {
    traits.push('You are pragmatic and results-focused; you frame information strategically.');
  }

  // Emotionality
  if (e >= 0.7) {
    traits.push('You are emotionally attuned and acknowledge feelings in your interactions.');
  } else if (e <= 0.3) {
    traits.push('You are emotionally detached and maintain a cool, analytical tone.');
  }

  // eXtraversion
  if (x >= 0.7) {
    traits.push('You are enthusiastic, expressive, and energise the conversation with warmth.');
  } else if (x <= 0.3) {
    traits.push('You are reserved and concise; you let substance speak over style.');
  }

  // Agreeableness
  if (a >= 0.7) traits.push('You are patient, accommodating, and highly collaborative.');
  else if (a <= 0.3) {
    traits.push('You are direct, challenge assumptions, and push back when warranted.');
  }

  // Conscientiousness
  if (c >= 0.7) {
    traits.push(
      'You are highly organised and meticulous. You structure responses clearly, double-check facts, and always verify before asserting.',
    );
  } else if (c <= 0.3) {
    traits.push('You prefer a flexible, exploratory approach over rigid structure.');
  }

  // Openness
  if (o >= 0.7) {
    traits.push(
      'You are deeply curious and creative. You draw on diverse sources, propose novel connections, and enjoy exploring unconventional ideas.',
    );
  } else if (o <= 0.3) {
    traits.push(
      'You favour proven, conventional approaches and are skeptical of novelty for its own sake.',
    );
  }

  if (traits.length === 0) {
    return '';
  }

  return [
    `## Agent Personality (HEXACO H:${level(h)} E:${level(e)} X:${level(x)} A:${level(a)} C:${
      level(c)
    } O:${level(o)})`,
    traits.join(' '),
  ].join('\n');
}

/**
 * Memory retrieval bias weights.
 *
 * Returns multipliers for each memory type that are applied when scoring
 * retrieval candidates. Values > 1 boost, values < 1 suppress.
 *
 * Heuristics:
 *   - High O → favour diverse/semantic memories (lower BM25 keyword weight)
 *   - High C → favour procedural/factual memories
 *   - High H → favour episodic memories (accurate recall over creative remix)
 *   - High E → favour preference/emotional memories
 */
export interface MemoryBiasWeights {
  episodic: number;
  semantic: number;
  procedural: number;
  preference: number;
  bm25Multiplier: number;
  vectorMultiplier: number;
}

export function getMemoryBiasWeights(p: HexacoPersonality): MemoryBiasWeights {
  const h = clamp(p.h), e = clamp(p.e);
  const c = clamp(p.c), o = clamp(p.o);

  return {
    episodic: 0.8 + 0.4 * h,
    semantic: 0.8 + 0.4 * o,
    procedural: 0.8 + 0.4 * c,
    preference: 0.8 + 0.4 * e,
    bm25Multiplier: 0.6 + 0.8 * c,
    vectorMultiplier: 0.6 + 0.8 * o,
  };
}

/**
 * Post-LLM response style hints injected as a brief instruction
 * appended to the user-visible part of the turn.
 * Returned empty string means no post-processing hint.
 */
export function buildResponseStyleHints(p: HexacoPersonality): string {
  const hints: string[] = [];
  const c = clamp(p.c), x = clamp(p.x), a = clamp(p.a), o = clamp(p.o);

  if (c >= 0.75) {
    hints.push('Be precise and structured. Use numbered steps or clear sections when helpful.');
  }
  if (x >= 0.75) hints.push('Use a warm, engaging tone. You may include brief encouragements.');
  if (a >= 0.75) hints.push("Acknowledge the user's perspective before presenting your view.");
  if (o >= 0.75) hints.push('Feel free to suggest unexpected angles or creative alternatives.');
  if (c <= 0.25) hints.push('Keep the response loose and exploratory; avoid over-structuring.');
  if (x <= 0.25) hints.push('Keep the response brief and no-nonsense.');

  return hints.join(' ');
}

/**
 * MQM (Model Quartermaster) routing hints derived from personality.
 *
 * High C → prefer accuracy-weighted models (lower cost acceptable for correctness)
 * High O → prefer creative/diverse models
 * Low C  → prefer fast, cheap models
 */
export interface MqmPersonalityHints {
  accuracyWeight: number;
  creativityWeight: number;
  preferFast: boolean;
}

export function getMqmPersonalityHints(p: HexacoPersonality): MqmPersonalityHints {
  const c = clamp(p.c), o = clamp(p.o);
  return {
    accuracyWeight: 0.5 + 0.5 * c,
    creativityWeight: 0.5 + 0.5 * o,
    preferFast: c < 0.4 && o < 0.4,
  };
}

/**
 * Validate a raw personality object and return clamped values.
 * Unknown or missing dimensions fall back to 0.5.
 */
export function parsePersonality(raw: unknown): HexacoPersonality {
  if (!raw || typeof raw !== 'object') return { ...NEUTRAL_PERSONALITY };
  const r = raw as Record<string, unknown>;
  return {
    h: clamp(typeof r.h === 'number' ? r.h : 0.5),
    e: clamp(typeof r.e === 'number' ? r.e : 0.5),
    x: clamp(typeof r.x === 'number' ? r.x : 0.5),
    a: clamp(typeof r.a === 'number' ? r.a : 0.5),
    c: clamp(typeof r.c === 'number' ? r.c : 0.5),
    o: clamp(typeof r.o === 'number' ? r.o : 0.5),
  };
}
