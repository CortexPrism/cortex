/**
 * Reusable WebSocket client with automatic reconnection, heartbeat management,
 * and message queuing. Designed for channel integrations (Discord, Slack, etc.).
 */

export interface WebSocketManagerConfig {
  url: string;
  heartbeatInterval?: number; // milliseconds
  reconnectDelay?: number; // milliseconds
  maxReconnectAttempts?: number;
  onMessage: (data: string) => void | Promise<void>;
  onOpen?: () => void | Promise<void>;
  onClose?: () => void | Promise<void>;
  onError?: (error: Event | Error) => void;
}

export enum WebSocketState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  RECONNECTING = 'RECONNECTING',
  CLOSED = 'CLOSED',
}

export class WebSocketManager {
  private static readonly MAX_QUEUE_SIZE = 1000;

  private ws: WebSocket | null = null;
  private config: WebSocketManagerConfig;
  private state: WebSocketState = WebSocketState.DISCONNECTED;
  private heartbeatTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private shouldReconnect = true;
  private messageQueue: string[] = [];
  private sequenceNumber: number | null = null;
  private sessionId: string | null = null;

  constructor(config: WebSocketManagerConfig) {
    this.config = {
      reconnectDelay: 5000,
      maxReconnectAttempts: Infinity,
      ...config,
    };
  }

  async connect(): Promise<void> {
    if (this.state === WebSocketState.CONNECTED || this.state === WebSocketState.CONNECTING) {
      console.warn('[websocket] Already connected or connecting');
      return;
    }

    this.state = WebSocketState.CONNECTING;
    this.shouldReconnect = true;

    try {
      this.ws = new WebSocket(this.config.url);

      this.ws.onopen = () => {
        this.state = WebSocketState.CONNECTED;
        this.reconnectAttempts = 0;
        console.log('[websocket] Connected to', this.config.url);

        // Flush queued messages
        while (this.messageQueue.length > 0) {
          const msg = this.messageQueue.shift();
          if (msg) this.send(msg);
        }

        if (this.config.onOpen) {
          Promise.resolve(this.config.onOpen()).catch((e) =>
            console.error('[websocket] onOpen error:', (e as Error).message)
          );
        }
      };

      this.ws.onmessage = (event) => {
        const data = event.data as string;
        Promise.resolve(this.config.onMessage(data)).catch((e) =>
          console.error('[websocket] onMessage error:', (e as Error).message)
        );
      };

      this.ws.onerror = (event) => {
        console.error('[websocket] Error:', event);
        if (this.config.onError) {
          this.config.onError(event);
        }
      };

      this.ws.onclose = () => {
        this.cleanup();

        if (this.shouldReconnect && this.reconnectAttempts < this.config.maxReconnectAttempts!) {
          this.state = WebSocketState.RECONNECTING;
          this.reconnectAttempts++;
          console.log(
            `[websocket] Disconnected — reconnecting in ${this.config.reconnectDelay}ms (attempt ${this.reconnectAttempts})`,
          );

          this.reconnectTimer = setTimeout(() => {
            this.connect();
          }, this.config.reconnectDelay) as unknown as number;
        } else {
          this.state = WebSocketState.DISCONNECTED;
          console.log('[websocket] Connection closed');
        }

        if (this.config.onClose) {
          Promise.resolve(this.config.onClose()).catch((e) =>
            console.error('[websocket] onClose error:', (e as Error).message)
          );
        }
      };

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('WebSocket connection timeout'));
        }, 10000);

        this.ws!.addEventListener('open', () => {
          clearTimeout(timeout);
          resolve();
        }, { once: true });

        this.ws!.addEventListener('error', (event) => {
          clearTimeout(timeout);
          reject(new Error('WebSocket connection failed'));
        }, { once: true });
      });
    } catch (error) {
      this.state = WebSocketState.DISCONNECTED;
      throw error;
    }
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.cleanup();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.state = WebSocketState.CLOSED;
    console.log('[websocket] Disconnected');
  }

  send(data: string): boolean {
    if (this.state !== WebSocketState.CONNECTED || !this.ws) {
      // Check queue size to prevent memory exhaustion
      if (this.messageQueue.length >= WebSocketManager.MAX_QUEUE_SIZE) {
        console.error(
          '[websocket] Message queue full (${this.messageQueue.length} messages), dropping message',
        );
        return false;
      }
      console.warn('[websocket] Not connected, queuing message');
      this.messageQueue.push(data);
      return false;
    }

    try {
      this.ws.send(data);
      return true;
    } catch (error) {
      console.error('[websocket] Send error:', (error as Error).message);
      // Check queue size before adding to queue
      if (this.messageQueue.length < WebSocketManager.MAX_QUEUE_SIZE) {
        this.messageQueue.push(data);
      } else {
        console.error('[websocket] Queue full, dropping message after send error');
      }
      return false;
    }
  }

  startHeartbeat(interval: number, payload?: () => string): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (this.state === WebSocketState.CONNECTED) {
        const data = payload ? payload() : JSON.stringify({ type: 'ping' });
        this.send(data);
      }
    }, interval) as unknown as number;
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  getState(): WebSocketState {
    return this.state;
  }

  isConnected(): boolean {
    return this.state === WebSocketState.CONNECTED;
  }

  setSequenceNumber(seq: number): void {
    this.sequenceNumber = seq;
  }

  getSequenceNumber(): number | null {
    return this.sequenceNumber;
  }

  setSessionId(id: string): void {
    this.sessionId = id;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  private cleanup(): void {
    this.stopHeartbeat();

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
