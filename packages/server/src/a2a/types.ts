/**
 * A2A Protocol Bridge — Core Types
 *
 * Implements the Google Agent2Agent (A2A) v1.0 protocol data model.
 * Reference: https://a2a-protocol.org/latest/specification/
 */

export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  defaultInputModes: string[];
  defaultOutputModes: string[];
  capabilities: AgentCapabilities;
  skills: AgentSkill[];
  provider?: AgentProvider;
  interfaces: AgentInterface[];
  securitySchemes?: Record<string, SecurityScheme>;
  extensions?: AgentExtension[];
  documentationUrl?: string;
  iconUrl?: string;
}

export interface AgentProvider {
  organization: string;
  url?: string;
}

export interface AgentCapabilities {
  streaming?: boolean;
  pushNotifications?: boolean;
  stateTransitionHistory?: boolean;
  extensions?: string[];
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
}

export interface AgentInterface {
  url: string;
  protocol: 'json-rpc' | 'grpc' | 'http+json';
  version?: string;
  tenant?: string;
}

export interface AgentExtension {
  name: string;
  version: string;
  parameters?: Record<string, unknown>;
}

export interface SecurityScheme {
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect' | 'mutualTls';
  description?: string;
}

export interface APIKeySecurityScheme extends SecurityScheme {
  type: 'apiKey';
  in: 'header' | 'query' | 'cookie';
  name: string;
}

export interface OAuth2SecurityScheme extends SecurityScheme {
  type: 'oauth2';
  flows: OAuthFlows;
}

export interface OAuthFlows {
  authorizationCode?: AuthorizationCodeOAuthFlow;
  clientCredentials?: ClientCredentialsOAuthFlow;
  deviceCode?: DeviceCodeOAuthFlow;
}

export interface AuthorizationCodeOAuthFlow {
  authorizationUrl: string;
  tokenUrl: string;
  refreshUrl?: string;
  scopes?: Record<string, string>;
}

export interface ClientCredentialsOAuthFlow {
  tokenUrl: string;
  refreshUrl?: string;
  scopes?: Record<string, string>;
}

export interface DeviceCodeOAuthFlow {
  deviceAuthorizationUrl: string;
  tokenUrl: string;
  scopes?: Record<string, string>;
}

export type TaskState =
  | 'TASK_STATE_UNSPECIFIED'
  | 'TASK_STATE_WORKING'
  | 'TASK_STATE_INPUT_REQUIRED'
  | 'TASK_STATE_COMPLETED'
  | 'TASK_STATE_FAILED'
  | 'TASK_STATE_CANCELED'
  | 'TASK_STATE_REJECTED';

export interface Task {
  id: string;
  contextId?: string;
  status: TaskStatus;
  artifacts?: Artifact[];
  history?: Message[];
  metadata?: Record<string, unknown>;
}

export interface TaskStatus {
  state: TaskState;
  message?: Message;
  timestamp?: string;
}

export type Role = 'user' | 'agent';

export interface Message {
  messageId: string;
  role: Role;
  parts: Part[];
  metadata?: Record<string, unknown>;
}

export interface Part {
  partId?: string;
  text?: string;
  file?: FilePart;
  data?: Record<string, unknown>;
}

export interface FilePart {
  name?: string;
  mimeType?: string;
  bytes?: string;
  uri?: string;
}

export interface Artifact {
  artifactId: string;
  name?: string;
  description?: string;
  parts: Part[];
  metadata?: Record<string, unknown>;
}

export interface TaskStatusUpdateEvent {
  taskId: string;
  contextId?: string;
  status: TaskStatus;
  final: boolean;
  metadata?: Record<string, unknown>;
}

export interface TaskArtifactUpdateEvent {
  taskId: string;
  contextId?: string;
  artifact: Artifact;
  append?: boolean;
  lastChunk?: boolean;
  metadata?: Record<string, unknown>;
}

export interface PushNotificationConfig {
  id: string;
  url: string;
  taskId: string;
  authentication?: AuthenticationInfo;
}

export interface AuthenticationInfo {
  schemeId: string;
  token?: string;
  type?: string;
}

export interface SendMessageRequest {
  message: Message;
  configuration?: SendMessageConfiguration;
  metadata?: Record<string, unknown>;
  tenant?: string;
}

export interface SendMessageConfiguration {
  blocking?: boolean;
  acceptedOutputModes?: string[];
  acceptedContextExtensions?: string[];
  pushNotificationConfig?: PushNotificationConfig;
  historyLength?: number;
  idempotencyKey?: string;
}

export interface StreamResponse {
  task?: Task;
  message?: Message;
  events?: Array<TaskStatusUpdateEvent | TaskArtifactUpdateEvent>;
}

export interface A2AError {
  code: number;
  message: string;
  data?: unknown;
}

export interface ListTasksRequest {
  contextId?: string;
  status?: TaskState;
  pageSize?: number;
  pageToken?: string;
  tenant?: string;
}

export interface ListTasksResponse {
  tasks: Task[];
  nextPageToken?: string;
}

export interface A2AConfig {
  enabled: boolean;
  server?: {
    port?: number;
    bindAddress?: string;
    allowedOrigins?: string[];
  };
  remoteAgents?: Record<string, RemoteAgentConfig>;
}

export interface RemoteAgentConfig {
  endpoint: string;
  agentCardUrl?: string;
  capabilities?: string[];
  authToken?: string;
  timeout?: number;
}
