import { err, json, notFound, type RouteHandler } from './_helpers.ts';

const disabledTools = new Set<string>();
const toolUsageStats = new Map<string, { calls: number; lastUsed: string | null }>();

function getToolStats(name: string) {
  if (!toolUsageStats.has(name)) {
    toolUsageStats.set(name, { calls: 0, lastUsed: null });
  }
  return toolUsageStats.get(name)!;
}

export { disabledTools, getToolStats, toolUsageStats };

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
        disabled: disabledTools.has(t.definition.name),
        stats: getToolStats(t.definition.name),
      }));
      return json(tools);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/tools\/([^/]+)\/stats$/,
    handler: async (_req, path) => {
      const name = path.match(/^\/api\/tools\/([^/]+)\/stats$/)?.[1];
      if (!name) return err('Invalid tool name', 400);
      const { globalRegistry } = await import('../../tools/registry.ts');
      if (!globalRegistry.has(name)) return notFound('Tool not found');
      const stats = getToolStats(name);
      return json({ name, ...stats });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/tools\/([^/]+)\/toggle$/,
    handler: async (req, path) => {
      const name = path.match(/^\/api\/tools\/([^/]+)\/toggle$/)?.[1];
      if (!name) return err('Invalid tool name', 400);
      const { globalRegistry } = await import('../../tools/registry.ts');
      if (!globalRegistry.has(name)) return notFound('Tool not found');

      const body = await req.json().catch(() => ({})) as { enabled?: boolean };
      const enabled = body.enabled !== false;
      if (enabled) {
        disabledTools.delete(name);
      } else {
        disabledTools.add(name);
      }
      return json({ name, disabled: disabledTools.has(name) });
    },
  },
];
