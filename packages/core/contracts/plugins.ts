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

export type PluginKind = 'esm' | 'mcp' | 'wasm';
export type PluginStatus = 'unloaded' | 'loading' | 'active' | 'unloading' | 'error';
export type TrustLevel = 'untrusted' | 'signed' | 'trusted';

export interface IToolParam {
  name: string;
  type: string;
  description: string;
  required?: boolean;
}

export interface IToolDeclaration {
  name: string;
  description: string;
  params: IToolParam[];
}

export interface ICliCommandOption {
  name: string;
  type: string;
  description: string;
  flag: string;
}

export interface ICliCommandDeclaration {
  name: string;
  description: string;
  args?: IToolParam[];
  options?: ICliCommandOption[];
}

export interface IUiPanel {
  id: string;
  title: string;
  icon?: string;
  htmlPath: string;
}

export interface IUiWidget {
  id: string;
  title: string;
  type: 'html' | 'chart' | 'table';
  config: Record<string, unknown>;
}

export interface IUiSettingField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'secret';
  defaultValue: unknown;
  options?: { label: string; value: string }[];
  description?: string;
}

export interface IUiContribution {
  panels?: IUiPanel[];
  widgets?: IUiWidget[];
  settings?: {
    section: string;
    fields: IUiSettingField[];
  }[];
}

export interface IConfigContribution {
  providers?: {
    kind: string;
    label: string;
    defaultModel: string;
  }[];
  settings?: Record<string, unknown>;
}

export interface IPluginManifest {
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
  tools?: IToolDeclaration[];
  cliCommands?: ICliCommandDeclaration[];
  ui?: IUiContribution;
  config?: IConfigContribution;
  events?: string[];
}

export interface IHostApi {
  registerTool(tool: Record<string, unknown>): void;
  unregisterTool(name: string): void;
}

export interface IPluginLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  debug(msg: string): void;
}

export interface IPluginStateStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<Record<string, string>>;
}

export interface IPluginConfigStore {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  getAll(): Promise<Record<string, unknown>>;
}

export interface IPluginContext {
  pluginId: string;
  pluginDir: string;
  state: IPluginStateStore;
  config: IPluginConfigStore;
  logger: IPluginLogger;
  host: IHostApi;
}
