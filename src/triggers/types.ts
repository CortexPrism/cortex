export type TriggerSource = 'webhook' | 'watcher' | 'git_hook';

export interface WebhookConfig {
  path: string;
  secretEnv?: string;
  secret?: string;
  allowedIps?: string[];
  providers: string[];
  events: string[];
}

export interface WatcherConfig {
  paths: string[];
  patterns?: string[];
  events: ('create' | 'modify' | 'delete')[];
  debounceMs: number;
  recursive: boolean;
}

export interface GitHookConfig {
  repoPath: string;
  hooks: string[];
  branches?: string[];
}

export interface TriggerAction {
  type: 'agent_turn' | 'system_event';
  agent?: string;
  promptTemplate: string;
  timeoutSeconds: number;
}

export interface RateLimit {
  count: number;
  perSeconds: number;
  cooldownSeconds: number;
}

export interface TriggerConfig {
  name: string;
  enabled: boolean;
  source: TriggerSource;
  webhook?: WebhookConfig;
  watcher?: WatcherConfig;
  gitHook?: GitHookConfig;
  action: TriggerAction;
  rateLimit?: RateLimit;
}

export interface TriggerEvent {
  triggerName: string;
  source: TriggerSource;
  timestamp: Date;
  data: Record<string, unknown>;
}

export interface WebhookProvider {
  name: string;
  headerName: string;
  signatureHeader: string;
  signaturePrefix: string;
  events: string[];
}

export const WEBHOOK_PROVIDERS: Record<string, WebhookProvider> = {
  github: {
    name: 'GitHub',
    headerName: 'X-GitHub-Event',
    signatureHeader: 'X-Hub-Signature-256',
    signaturePrefix: 'sha256=',
    events: ['push', 'pull_request', 'issues', 'release', 'check_run'],
  },
  gitlab: {
    name: 'GitLab',
    headerName: 'X-Gitlab-Event',
    signatureHeader: 'X-Gitlab-Token',
    signaturePrefix: '',
    events: ['Push Hook', 'Merge Request Hook', 'Issue Hook'],
  },
  generic: {
    name: 'Generic',
    headerName: 'X-Event-Type',
    signatureHeader: 'X-Signature',
    signaturePrefix: '',
    events: ['*'],
  },
};
