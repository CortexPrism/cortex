export type PluginEvent =
  | { type: 'session:start'; sessionId: string }
  | { type: 'session:end'; sessionId: string }
  | { type: 'tool:pre-execute'; toolName: string; args: Record<string, unknown> }
  | { type: 'tool:post-execute'; toolName: string; result: unknown }
  | { type: 'llm:pre-call'; provider: string; model: string }
  | { type: 'llm:post-call'; provider: string; model: string; tokensIn: number; tokensOut: number }
  | { type: 'agent:turn-start'; sessionId: string; turnId: string }
  | { type: 'agent:turn-end'; sessionId: string; turnId: string; response: string }
  | { type: 'config:change'; key: string; value: unknown }
  | { type: 'daemon:status'; daemon: string; status: 'up' | 'down' };

type EventHandler = (event: PluginEvent) => void | Promise<void>;

export class EventBus {
  private listeners = new Map<string, Set<EventHandler>>();
  private subscriptions = new Map<string, Set<string>>();

  subscribe(pluginName: string, eventTypes: string[]): void {
    const existing = this.subscriptions.get(pluginName) ?? new Set();
    for (const t of eventTypes) existing.add(t);
    this.subscriptions.set(pluginName, existing);
  }

  unsubscribe(pluginName: string): void {
    this.subscriptions.delete(pluginName);
  }

  on(type: string, handler: EventHandler): void {
    const handlers = this.listeners.get(type) ?? new Set();
    handlers.add(handler);
    this.listeners.set(type, handlers);
  }

  off(type: string, handler: EventHandler): void {
    const handlers = this.listeners.get(type);
    if (handlers) handlers.delete(handler);
  }

  emit(event: PluginEvent): void {
    const handlers = this.listeners.get(event.type);
    if (!handlers || handlers.size === 0) return;
    for (const handler of handlers) {
      try {
        const result = handler(event);
        if (result instanceof Promise) {
          result.catch((e) => console.error(`[EventBus] handler error:`, e));
        }
      } catch (e) {
        console.error(`[EventBus] handler error:`, e);
      }
    }
  }

  emitForPlugin(pluginName: string, event: PluginEvent): void {
    const subs = this.subscriptions.get(pluginName);
    if (!subs || !subs.has(event.type)) return;
    this.emit(event);
  }
}

export const globalEventBus = new EventBus();
