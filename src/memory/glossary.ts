const terms = new Map<string, { definition: string; aliases: string[]; category: string }>();

export function defineTerm(
  name: string,
  definition: string,
  category = 'general',
  aliases: string[] = [],
): void {
  terms.set(name.toLowerCase(), {
    definition,
    aliases: aliases.map((a) => a.toLowerCase()),
    category,
  });
}

export function lookupTerm(
  name: string,
): { name: string; definition: string; aliases: string[]; category: string } | null {
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

export function listTerms(
  category?: string,
): Array<{ name: string; definition: string; category: string }> {
  const all = Array.from(terms.entries()).map(([name, t]) => ({
    name,
    definition: t.definition,
    category: t.category,
  }));
  return category ? all.filter((t) => t.category === category) : all;
}

export function getCategories(): string[] {
  return [...new Set(Array.from(terms.values()).map((t) => t.category))].sort();
}
