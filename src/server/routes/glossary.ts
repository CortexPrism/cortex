import { err, json, notFound, type RouteHandler } from './_helpers.ts';
import { defineTerm, getCategories, listTerms, lookupTerm } from '../../memory/glossary.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/glossary\/categories$/,
    handler: async () => {
      const categories = await getCategories();
      return json(categories);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/glossary\/([^/]+)$/,
    handler: async (_req, path) => {
      const term = decodeURIComponent(path.split('/api/glossary/')[1]);
      const result = await lookupTerm(term);
      if (!result) return notFound('Term not found');
      return json(result);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/glossary$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const category = url.searchParams.get('category') || undefined;
      const terms = await listTerms(category);
      return json(terms);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/glossary$/,
    handler: async (req) => {
      const body = await req.json() as {
        term: string;
        definition: string;
        category?: string;
        aliases?: string[];
      };
      if (!body.term?.trim()) return err('Missing term name', 400);
      if (!body.definition?.trim()) return err('Missing definition', 400);
      await defineTerm(
        body.term.trim(),
        body.definition.trim(),
        body.category?.trim() || 'general',
        body.aliases ?? [],
      );
      return json({ ok: true, term: body.term.trim() });
    },
  },
];
