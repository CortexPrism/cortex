export type IpcMessageType =
  | 'intent'
  | 'intent_response'
  | 'execute'
  | 'execute_result'
  | 'credential_request'
  | 'credential_response'
  | 'heartbeat'
  | 'error';

export interface IIpcMessage {
  type: IpcMessageType;
  id: string;
  [key: string]: unknown;
}

export interface IIPCTransport {
  send(channel: string, msg: IIpcMessage): Promise<void>;
  on(channel: string, handler: (msg: IIpcMessage) => void): void;
  off(channel: string, handler: (msg: IIpcMessage) => void): void;
}

export interface IIntentMessage extends IIpcMessage {
  type: 'intent';
  sessionId: string;
  turnId: string;
  timestamp: string;
  intent: {
    action: string;
    params: Record<string, unknown>;
    justification?: string;
  };
  context?: {
    userMessage?: string;
    riskLevel?: 'low' | 'medium' | 'high';
  };
}

export interface IIntentResult {
  approved: boolean;
  action?: string;
  params?: Record<string, unknown>;
  rejectionReason?: string;
}
