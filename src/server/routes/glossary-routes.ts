import { err, json, type RouteHandler } from './_helpers.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/glossary$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const { listTerms, getCategories } = await import('../../memory/glossary.ts');
      const category = url.searchParams.get('category');
      const [terms, categories] = await Promise.all([
        listTerms(category || undefined),
        getCategories(),
      ]);
      return json({ terms, categories });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/glossary$/,
    handler: async (req) => {
      const body = await req.json() as {
        name: string;
        definition: string;
        category?: string;
        aliases?: string[];
      };
      if (!body.name || !body.definition) return err('name and definition required', 400);
      const { defineTerm } = await import('../../memory/glossary.ts');
      await defineTerm(body.name, body.definition, body.category || 'general', body.aliases ?? []);
      return json({ ok: true }, 201);
    },
  },
];
