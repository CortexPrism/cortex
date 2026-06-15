export type ProviderFactory = (config: Record<string, unknown>) => unknown;

const _providers = new Map<string, ProviderFactory>();

export function registerProvider(kind: string, factory: ProviderFactory): void {
  _providers.set(kind, factory);
}

export function getProviderFactory(kind: string): ProviderFactory | undefined {
  return _providers.get(kind);
}

export function listRegisteredProviderKinds(): string[] {
  return [..._providers.keys()];
}

export function isPluginProvider(kind: string): boolean {
  return _providers.has(kind);
}

export function buildPluginProvider(kind: string, config: Record<string, unknown>): unknown {
  const factory = _providers.get(kind);
  if (!factory) throw new Error(`Plugin provider "${kind}" not found`);
  return factory(config);
}
