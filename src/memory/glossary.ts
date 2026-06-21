import { getMemoryDb } from '../db/client.ts';

const GLOSSARY_CATEGORY = '__glossary__';

const terms = new Map<string, { definition: string; aliases: string[]; category: string }>();
let loaded = false;

async function loadFromDb(): Promise<void> {
  if (loaded) return;
  loaded = true;

  const db = await getMemoryDb().catch(() => null);
  if (!db) return;

  const rows = await db.all<{
    content: string;
    tags: string;
    category: string;
  }>(
    `SELECT content, tags, category
     FROM semantic_memory
     WHERE category LIKE '${GLOSSARY_CATEGORY}%'`,
  ).catch(() => []);

  for (const row of rows) {
    try {
      const parsedTags: string[] = JSON.parse(row.tags ?? '[]');
      const termCategory = row.category.replace(`${GLOSSARY_CATEGORY}:`, '') || 'general';
      const name = parsedTags[0] ?? '';
      const definition = row.content;
      const aliases = parsedTags.slice(1);

      if (!name) continue;

      terms.set(name.toLowerCase(), {
        definition,
        aliases: aliases.map((a: string) => a.toLowerCase()),
        category: termCategory,
      });
    } catch { /* skip malformed rows */ }
  }
}

export async function defineTerm(
  name: string,
  definition: string,
  category = 'general',
  aliases: string[] = [],
): Promise<void> {
  await loadFromDb();

  const lower = name.toLowerCase();
  terms.set(lower, {
    definition,
    aliases: aliases.map((a) => a.toLowerCase()),
    category,
  });

  const db = await getMemoryDb().catch(() => null);
  if (!db) return;

  const existing = await db.get<{ id: string }>(
    `SELECT id FROM semantic_memory WHERE category = ? AND tags LIKE ? LIMIT 1`,
    [`${GLOSSARY_CATEGORY}:${category}`, `%${name}%`],
  ).catch(() => null);

  const tagList = JSON.stringify([name, ...aliases]);
  const dbCategory = `${GLOSSARY_CATEGORY}:${category}`;

  if (existing) {
    await db.run(
      `UPDATE semantic_memory SET content = ?, tags = ?, updated_at = datetime('now') WHERE id = ?`,
      [definition, tagList, existing.id],
    ).catch(() => {});
  } else {
    const id = `gloss_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO semantic_memory (id, content, category, tags, importance, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1.0, ?, ?)`,
      [id, definition, dbCategory, tagList, now, now],
    ).catch(() => {});
  }
}

export async function lookupTerm(
  name: string,
): Promise<{ name: string; definition: string; aliases: string[]; category: string } | null> {
  await loadFromDb();

  const lower = name.toLowerCase();
  const direct = terms.get(lower);
  if (direct) {
    return {
      name,
      definition: direct.definition,
      aliases: direct.aliases,
      category: direct.category,
    };
  }
  for (const [key, term] of terms) {
    if (term.aliases.includes(lower)) {
      return {
        name: key,
        definition: term.definition,
        aliases: term.aliases,
        category: term.category,
      };
    }
  }
  return null;
}

export async function listTerms(
  category?: string,
): Promise<Array<{ name: string; definition: string; category: string }>> {
  await loadFromDb();

  const all = Array.from(terms.entries()).map(([name, t]) => ({
    name,
    definition: t.definition,
    category: t.category,
  }));
  return category ? all.filter((t) => t.category === category) : all;
}

export async function getCategories(): Promise<string[]> {
  await loadFromDb();
  return [...new Set(Array.from(terms.values()).map((t) => t.category))].sort();
}
