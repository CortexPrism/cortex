/**
 * User Preference Learner — #68
 *
 * Observes user corrections and overrides over time to learn implicit
 * preferences: coding style, library choices, naming conventions, risk
 * tolerance. No explicit configuration needed — builds a preference
 * model from feedback signals.
 */

export interface UserPreference {
  category: PreferenceCategory;
  key: string;
  value: string;
  confidence: number;
  evidenceCount: number;
  lastObserved: string;
  firstObserved: string;
  source: 'correction' | 'override' | 'explicit' | 'pattern';
}

export type PreferenceCategory =
  | 'coding_style'
  | 'library_choice'
  | 'naming_convention'
  | 'risk_tolerance'
  | 'communication_style'
  | 'tool_preference'
  | 'language_choice'
  | 'testing_style'
  | 'documentation_style'
  | 'architecture_pattern';

export interface PreferenceObservation {
  category: PreferenceCategory;
  key: string;
  value: string;
  source: 'correction' | 'override' | 'explicit' | 'pattern';
  sessionId: string;
  context?: string;
}

export interface PreferenceReport {
  preferences: UserPreference[];
  highConfidence: UserPreference[];
  recentChanges: UserPreference[];
  categoryBreakdown: Record<string, number>;
}

const preferences = new Map<string, UserPreference>();

export function observePreference(observation: PreferenceObservation): UserPreference {
  const prefKey = `${observation.category}:${observation.key}`;
  const existing = preferences.get(prefKey);
  const now = new Date().toISOString();

  if (existing) {
    const valueMatch = existing.value === observation.value;
    const newConfidence = valueMatch
      ? Math.min(1.0, existing.confidence + 0.15)
      : Math.max(0.1, existing.confidence * 0.7);

    const updated: UserPreference = {
      ...existing,
      value: valueMatch ? existing.value : observation.value,
      confidence: newConfidence,
      evidenceCount: existing.evidenceCount + 1,
      lastObserved: now,
      source: observation.source,
    };

    preferences.set(prefKey, updated);
    return updated;
  }

  const preference: UserPreference = {
    category: observation.category,
    key: observation.key,
    value: observation.value,
    confidence: 0.3,
    evidenceCount: 1,
    lastObserved: now,
    firstObserved: now,
    source: observation.source,
  };

  preferences.set(prefKey, preference);
  return preference;
}

export function getPreference(
  category: PreferenceCategory,
  key: string,
): UserPreference | undefined {
  return preferences.get(`${category}:${key}`);
}

export function getPreferencesByCategory(
  category: PreferenceCategory,
): UserPreference[] {
  return Array.from(preferences.values())
    .filter((p) => p.category === category)
    .sort((a, b) => b.confidence - a.confidence);
}

export function getPreferencesByConfidence(
  minConfidence = 0.5,
): UserPreference[] {
  return Array.from(preferences.values())
    .filter((p) => p.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence);
}

export function generatePreferenceReport(): PreferenceReport {
  const all = Array.from(preferences.values());

  const highConfidence = all
    .filter((p) => p.confidence >= 0.7)
    .sort((a, b) => b.confidence - a.confidence);

  const recentChanges = all
    .filter((p) => {
      const observed = new Date(p.lastObserved).getTime();
      const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      return observed > oneWeekAgo;
    })
    .sort((a, b) => b.lastObserved.localeCompare(a.lastObserved));

  const categoryBreakdown: Record<string, number> = {};
  for (const pref of all) {
    categoryBreakdown[pref.category] = (categoryBreakdown[pref.category] ?? 0) + 1;
  }

  return {
    preferences: all,
    highConfidence,
    recentChanges,
    categoryBreakdown,
  };
}

export function buildPreferenceContext(): string {
  const highConf = getPreferencesByConfidence(0.6);
  if (highConf.length === 0) return '';

  const byCategory = new Map<string, string[]>();
  for (const pref of highConf) {
    const existing = byCategory.get(pref.category) ?? [];
    existing.push(`${pref.key}: ${pref.value} (confidence: ${(pref.confidence * 100).toFixed(0)}%)`);
    byCategory.set(pref.category, existing);
  }

  const lines: string[] = [
    '[User Preferences — learned from past interactions]',
    '',
  ];

  for (const [category, items] of byCategory) {
    const label = category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    lines.push(`**${label}:**`);
    for (const item of items) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }

  lines.push('Consider these preferences when generating code, making decisions, or suggesting approaches.');
  lines.push('');

  return lines.join('\n');
}

export function learnFromCorrection(
  sessionId: string,
  correction: string,
  context: string,
): void {
  const patterns = extractPreferencePatterns(correction, context);
  for (const pattern of patterns) {
    observePreference(pattern);
  }
}

function extractPreferencePatterns(
  correction: string,
  context: string,
): PreferenceObservation[] {
  const observations: PreferenceObservation[] = [];
  const lower = correction.toLowerCase();

  if (lower.includes('camelcase') || lower.includes('snake_case') || lower.includes('pascalcase')) {
    observations.push({
      category: 'naming_convention',
      key: 'style',
      value: lower.includes('camelcase') ? 'camelCase' : lower.includes('snake_case') ? 'snake_case' : 'PascalCase',
      source: 'correction',
      sessionId: '',
      context: correction,
    });
  }

  if (lower.includes('use ') && (lower.includes(' instead') || lower.includes(' rather'))) {
    const match = correction.match(/use\s+(\S+)/i);
    if (match) {
      observations.push({
        category: 'library_choice',
        key: 'preferred_library',
        value: match[1],
        source: 'correction',
        sessionId: '',
        context: correction,
      });
    }
  }

  if (lower.includes('prefer') || lower.includes('i like') || lower.includes('always use')) {
    observations.push({
      category: 'coding_style',
      key: 'explicit_preference',
      value: correction.slice(0, 100),
      source: 'explicit',
      sessionId: '',
      context: correction,
    });
  }

  if (lower.includes('conservative') || lower.includes('safe') || lower.includes('aggressive')) {
    observations.push({
      category: 'risk_tolerance',
      key: 'level',
      value: lower.includes('aggressive') ? 'high' : lower.includes('conservative') ? 'low' : 'medium',
      source: 'correction',
      sessionId: '',
      context: correction,
    });
  }

  return observations;
}

export function clearPreferences(category?: PreferenceCategory): void {
  if (category) {
    for (const [key, pref] of preferences) {
      if (pref.category === category) preferences.delete(key);
    }
  } else {
    preferences.clear();
  }
}
