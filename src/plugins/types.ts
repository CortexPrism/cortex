import type { Tool } from '../tools/types.ts';

export type PluginKind = 'esm' | 'mcp' | 'wasm';

export type PluginCapability =
  | 'tools'
  | 'cli:commands'
  | 'ui:panel'
  | 'ui:widget'
  | 'config:schema'
  | 'config:provider'
  | 'memory:store'
  | 'memory:embedder'
  | 'events:listener'
  | 'middleware:pre'
  | 'middleware:post'
  | 'network:fetch'
  | 'fs:read'
  | 'fs:write'
  | 'fs:list'
  | 'fs:edit'
  | 'fs:delete'
  | 'fs:search'
  | 'shell:run'
  | 'db:read'
  | 'db:write'
  | 'net:outbound'
  | 'net:inbound';

export type PluginStatus = 'unloaded' | 'loading' | 'active' | 'unloading' | 'error';
export type TrustLevel = 'untrusted' | 'signed' | 'trusted';

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  kind: PluginKind;
  entryPoint: string;
  runtime: 'deno' | 'wasm';
  capabilities: PluginCapability[];
  author?: string;
  homepage?: string;
  license?: string;
  repository?: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  hash?: string;
  signature?: string;
  tools?: ToolDeclaration[];
  cliCommands?: CliCommandDeclaration[];
  ui?: UiContribution;
  config?: ConfigContribution;
  events?: string[];
}

export interface PluginRow {
  name: string;
  version: string;
  prev_version: string | null;
  type: string;
  runtime: string;
  entry: string;
  manifest_json: string;
  declared_permissions: string;
  effective_permissions: string;
  author: string | null;
  description: string | null;
  license: string | null;
  source: string | null;
  integrity_hash: string | null;
  enabled: number;
  status: string;
  process_id: number | null;
  installed_at: string;
  updated_at: string | null;
  last_load_at: string | null;
  dependencies_json: string | null;
  trust_level: string;
  error_message: string | null;
  load_attempts: number;
  config_schema_json: string | null;
}

export interface ToolDeclaration {
  name: string;
  description: string;
  params: {
    name: string;
    type: string;
    description: string;
    required?: boolean;
  }[];
}

export interface CliCommandDeclaration {
  name: string;
  description: string;
  args?: {
    name: string;
    type: string;
    description: string;
    required?: boolean;
  }[];
  options?: {
    name: string;
    type: string;
    description: string;
    flag: string;
  }[];
}

export interface UiContribution {
  panels?: {
    id: string;
    title: string;
    icon?: string;
    htmlPath: string;
  }[];
  widgets?: {
    id: string;
    title: string;
    type: 'html' | 'chart' | 'table';
    config: Record<string, unknown>;
  }[];
  settings?: {
    section: string;
    fields: UiSettingField[];
  }[];
}

export interface UiSettingField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'secret';
  defaultValue: unknown;
  options?: { label: string; value: string }[];
  description?: string;
}

export interface ConfigContribution {
  providers?: {
    kind: string;
    label: string;
    defaultModel: string;
  }[];
  settings?: Record<string, unknown>;
}

export type ProviderFactory = (config: Record<string, unknown>) => unknown;

export interface PluginModule {
  tools?: Tool[];
  cliCommands?: CliCommandDeclaration[];
  providers?: Record<string, ProviderFactory>;
  onLoad?: (ctx: PluginContext) => Promise<void>;
  onUnload?: (ctx: PluginContext) => Promise<void>;
  onConfigChange?: (key: string, value: unknown, ctx: PluginContext) => Promise<void>;
}

export interface LoadedPlugin {
  row: PluginRow;
  tools: Tool[];
  module?: PluginModule;
}

export interface PluginLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  debug(msg: string): void;
}

export interface PluginStateStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<Record<string, string>>;
}

export interface PluginConfigStore {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  getAll(): Promise<Record<string, unknown>>;
}

export interface HostApi {
  registerTool(tool: Tool): void;
  unregisterTool(name: string): void;
}

export interface PluginContext {
  pluginId: string;
  pluginDir: string;
  state: PluginStateStore;
  config: PluginConfigStore;
  logger: PluginLogger;
  host: HostApi;
}

export interface PluginLifecycle {
  onInstall?(ctx: PluginContext): Promise<void>;
  onLoad?(ctx: PluginContext): Promise<void>;
  onActivate?(ctx: PluginContext): Promise<void>;
  onDeactivate?(ctx: PluginContext): Promise<void>;
  onUnload?(ctx: PluginContext): Promise<void>;
  onUninstall?(ctx: PluginContext): Promise<void>;
  onConfigChange?(key: string, value: unknown, ctx: PluginContext): Promise<void>;
}
