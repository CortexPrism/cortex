/**
 * User Preference Learner — #68
 *
 * Observes user corrections and overrides over time to learn implicit
 * preferences: coding style, library choices, naming conventions, risk
 * tolerance. Persisted to semantic_memory for durability across restarts.
 */

import { getMemoryDb } from '../../../../src/db/client.ts';

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

const PREF_CATEGORY_PREFIX = '__pref__';
const preferences = new Map<string, UserPreference>();
let loaded = false;

function prefId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

async function persistPreference(pref: UserPreference): Promise<void> {
  const db = await getMemoryDb().catch(() => null);
  if (!db) return;

  const existing = await db.get<{ id: string }>(
    `SELECT id FROM semantic_memory WHERE category = ? AND tags LIKE ? LIMIT 1`,
    [`${PREF_CATEGORY_PREFIX}${pref.category}`, `%${pref.key}%`],
  ).catch(() => null);

  if (existing) {
    await db.run(
      `UPDATE semantic_memory
       SET content = ?,
           importance = ?,
           access_count = ?,
           updated_at = ?
       WHERE id = ?`,
      [
        pref.value,
        pref.confidence,
        pref.evidenceCount,
        pref.lastObserved,
        existing.id,
      ],
    ).catch(() => {});
  } else {
    const id = prefId('pref');
    await db.run(
      `INSERT INTO semantic_memory (id, content, category, tags, importance, access_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        pref.value,
        `${PREF_CATEGORY_PREFIX}${pref.category}`,
        JSON.stringify([pref.key, pref.source]),
        pref.confidence,
        pref.evidenceCount,
        pref.firstObserved,
        pref.lastObserved,
      ],
    ).catch(() => {});
  }
}

async function loadPreferencesFromDb(): Promise<void> {
  if (loaded) return;
  loaded = true;

  const db = await getMemoryDb().catch(() => null);
  if (!db) return;

  const rows = await db.all<{
    id: string;
    content: string;
    category: string;
    tags: string;
    importance: number;
    access_count: number;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, content, category, tags, importance, access_count, created_at, updated_at
     FROM semantic_memory
     WHERE category LIKE '${PREF_CATEGORY_PREFIX}%'`,
  ).catch(() => []);

  for (const row of rows) {
    try {
      const category = row.category.replace(PREF_CATEGORY_PREFIX, '') as PreferenceCategory;
      const parsedTags: string[] = JSON.parse(row.tags ?? '[]');
      const key = parsedTags[0] ?? '';
      const source = (parsedTags[1] ?? 'pattern') as UserPreference['source'];

      if (!category || !key) continue;

      preferences.set(`${category}:${key}`, {
        category,
        key,
        value: row.content,
        confidence: row.importance,
        evidenceCount: row.access_count,
        lastObserved: row.updated_at,
        firstObserved: row.created_at,
        source,
      });
    } catch { /* skip malformed rows */ }
  }
}

export async function observePreference(
  observation: PreferenceObservation,
): Promise<UserPreference> {
  await loadPreferencesFromDb();

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
    void persistPreference(updated);
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
  void persistPreference(preference);
  return preference;
}

export async function getPreference(
  category: PreferenceCategory,
  key: string,
): Promise<UserPreference | undefined> {
  await loadPreferencesFromDb();
  return preferences.get(`${category}:${key}`);
}

export async function getPreferencesByCategory(
  category: PreferenceCategory,
): Promise<UserPreference[]> {
  await loadPreferencesFromDb();
  return Array.from(preferences.values())
    .filter((p) => p.category === category)
    .sort((a, b) => b.confidence - a.confidence);
}

export async function getPreferencesByConfidence(
  minConfidence = 0.5,
): Promise<UserPreference[]> {
  await loadPreferencesFromDb();
  return Array.from(preferences.values())
    .filter((p) => p.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence);
}

export async function generatePreferenceReport(): Promise<PreferenceReport> {
  await loadPreferencesFromDb();

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

export async function buildPreferenceContext(): Promise<string> {
  const highConf = await getPreferencesByConfidence(0.6);
  if (highConf.length === 0) return '';

  const byCategory = new Map<string, string[]>();
  for (const pref of highConf) {
    const existing = byCategory.get(pref.category) ?? [];
    existing.push(
      `${pref.key}: ${pref.value} (confidence: ${(pref.confidence * 100).toFixed(0)}%)`,
    );
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

  lines.push(
    'Consider these preferences when generating code, making decisions, or suggesting approaches.',
  );
  lines.push('');

  return lines.join('\n');
}

export async function learnFromCorrection(
  sessionId: string,
  correction: string,
  context: string,
): Promise<void> {
  const patterns = extractPreferencePatterns(correction, context, sessionId);
  for (const pattern of patterns) {
    await observePreference(pattern);
  }
}

function extractPreferencePatterns(
  correction: string,
  _context: string,
  sessionId: string,
): PreferenceObservation[] {
  const observations: PreferenceObservation[] = [];
  const lower = correction.toLowerCase();

  if (
    lower.includes('camelcase') || lower.includes('snake_case') || lower.includes('pascalcase')
  ) {
    observations.push({
      category: 'naming_convention',
      key: 'style',
      value: lower.includes('camelcase')
        ? 'camelCase'
        : lower.includes('snake_case')
        ? 'snake_case'
        : 'PascalCase',
      source: 'correction',
      sessionId,
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
        sessionId,
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
      sessionId,
      context: correction,
    });
  }

  if (lower.includes('conservative') || lower.includes('safe') || lower.includes('aggressive')) {
    observations.push({
      category: 'risk_tolerance',
      key: 'level',
      value: lower.includes('aggressive')
        ? 'high'
        : lower.includes('conservative')
        ? 'low'
        : 'medium',
      source: 'correction',
      sessionId,
      context: correction,
    });
  }

  return observations;
}

export async function clearPreferences(category?: PreferenceCategory): Promise<void> {
  await loadPreferencesFromDb();

  const db = await getMemoryDb().catch(() => null);

  if (category) {
    for (const [key, pref] of preferences) {
      if (pref.category === category) preferences.delete(key);
    }
    if (db) {
      await db.run(
        `DELETE FROM semantic_memory WHERE category = ?`,
        [`${PREF_CATEGORY_PREFIX}${category}`],
      ).catch(() => {});
    }
  } else {
    preferences.clear();
    if (db) {
      await db.run(
        `DELETE FROM semantic_memory WHERE category LIKE '${PREF_CATEGORY_PREFIX}%'`,
      ).catch(() => {});
    }
  }
}
