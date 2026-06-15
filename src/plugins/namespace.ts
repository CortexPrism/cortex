export interface NamespacedPlugin {
  author: string;
  name: string;
  fullName: string;
}

export function parsePluginName(raw: string): NamespacedPlugin {
  const match = raw.match(/^@([^/]+)\/(.+)$/);
  if (match) {
    return { author: match[1], name: match[2], fullName: raw };
  }
  return { author: 'unknown', name: raw, fullName: `@unknown/${raw}` };
}

export function formatPluginName(author: string, name: string): string {
  return `@${author}/${name}`;
}

export function toolName(pluginFullName: string, toolBaseName: string): string {
  return `${pluginFullName}/${toolBaseName}`;
}

export function parseToolName(fullToolName: string): { plugin: string; tool: string } | null {
  const match = fullToolName.match(/^@([^/]+)\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return {
    plugin: `@${match[1]}/${match[2]}`,
    tool: match[3],
  };
}

const aliases = new Map<string, string>();

export function setToolAlias(alias: string, target: string): void {
  const existing = aliases.get(alias);
  if (existing) {
    console.warn(`[namespace] Alias "${alias}" overwritten. Previously: ${existing}`);
  }
  aliases.set(alias, target);
}

export function resolveAlias(name: string): string {
  return aliases.get(name) ?? name;
}

export function listAliases(): Map<string, string> {
  return new Map(aliases);
}

export function removeAlias(alias: string): boolean {
  return aliases.delete(alias);
}

export function validateAuthorKey(
  pluginName: string,
  author: string,
  existingKey: string | null,
  newKey: string,
): { valid: boolean; reason?: string } {
  if (!existingKey) return { valid: true };

  if (existingKey !== newKey) {
    return {
      valid: false,
      reason: `Plugin @${author}/ conflicts with existing author "${author}" signed by a different key.`,
    };
  }

  return { valid: true };
}
