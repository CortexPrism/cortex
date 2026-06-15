import type { Tool, ToolDefinition } from './types.ts';

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.definition.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }

  definitions(): ToolDefinition[] {
    return this.list().map((t) => t.definition);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  async loadEsm(specifier: string): Promise<void> {
    const mod = await import(specifier) as { default?: Tool; tool?: Tool };
    const tool = mod.default ?? mod.tool;
    if (!tool || typeof tool.execute !== 'function') {
      throw new Error(`Module ${specifier} does not export a valid Tool`);
    }
    this.register(tool);
  }
}

export const globalRegistry = new ToolRegistry();
