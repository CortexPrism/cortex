import { type RouteHandler, json } from './_helpers.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/tools\/list$/,
    handler: async () => {
      const { globalRegistry } = await import('../../tools/registry.ts');
      const names = globalRegistry.toolNames();
      return json(names);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/tools\/registry$/,
    handler: async () => {
      const { globalRegistry } = await import('../../tools/registry.ts');
      const tools = globalRegistry.list().map((t) => ({
        name: t.definition.name,
        description: t.definition.description,
        params: t.definition.params || [],
        capabilities: t.definition.capabilities || [],
      }));
      return json(tools);
    },
  },
];
