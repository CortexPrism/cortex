export interface ImportResult {
  sessions: number;
  messages: number;
  memories: number;
  policies: number;
  errors: number;
}

export interface ImportSource {
  name: string;
  description: string;
  import(path: string, opts?: ImportOptions): Promise<ImportResult>;
}

export interface ImportOptions {
  dryRun?: boolean;
}

export interface HermesSession {
  id: string;
  source?: string;
  user_id?: string;
  model?: string;
  model_config?: string;
  system_prompt?: string;
  parent_session_id?: string;
  started_at?: number;
  ended_at?: number;
  end_reason?: string;
  title?: string;
  message_count?: number;
  tool_call_count?: number;
  input_tokens?: number;
  output_tokens?: number;
}

export interface HermesMessage {
  id?: number;
  session_id?: string;
  role: string;
  content: string;
  tool_calls?: string;
  tool_call_id?: string;
  tool_name?: string;
  timestamp?: number;
  token_count?: number;
}

export interface HermesJSONL {
  type?: string;
  id?: string;
  source?: string;
  model?: string;
  system_prompt?: string;
  messages?: Array<{ role: string; content: string }>;
  conversations?: Array<{ from: string; value: string }>;
  session_id?: string;
  role?: string;
  content?: string;
  timestamp?: number;
  [key: string]: unknown;
}

export interface ZeroClawTranscriptHeader {
  id: string;
  parentId?: string;
  agentId?: string;
  model?: string;
  systemPrompt?: string;
  startedAt?: string;
  type: 'session';
}

export interface ZeroClawTranscriptEvent {
  id: string;
  parentId?: string;
  type:
    | 'message'
    | 'custom_message'
    | 'custom'
    | 'compaction'
    | 'branch_summary'
    | 'model_change'
    | 'thinking_level_change';
  role?: string;
  content?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}
