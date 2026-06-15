import type { ChannelPlugin, ChannelConfig, ChannelEvent, ChannelTarget, EventHandler } from './types.ts';

interface RegisteredChannel {
  plugin: ChannelPlugin;
  config: ChannelConfig;
  enabled: boolean;
  agentId: string;
}

const channels = new Map<string, RegisteredChannel>();
const eventHandlers = new Map<string, EventHandler>();

export function registerChannel(
  id: string,
  plugin: ChannelPlugin,
  config: ChannelConfig,
  agentId = 'default',
): void {
  const channel: RegisteredChannel = {
    plugin,
    config,
    enabled: false,
    agentId,
  };
  channels.set(id, channel);
}

export function unregisterChannel(id: string): boolean {
  return channels.delete(id);
}

export async function startChannel(id: string): Promise<void> {
  const channel = channels.get(id);
  if (!channel) throw new Error(`Channel ${id} not found`);

  await channel.plugin.connect(channel.config);

  channel.plugin.onEvent(async (event: ChannelEvent) => {
    const handler = eventHandlers.get(id);
    if (handler) {
      try {
        await handler(event);
      } catch (e) {
        console.error(`[channels] Error handling event for ${id}: ${(e as Error).message}`);
      }
    }
  });

  channel.enabled = true;
}

export async function stopChannel(id: string): Promise<void> {
  const channel = channels.get(id);
  if (!channel) return;
  await channel.plugin.disconnect();
  channel.enabled = false;
}

export function setEventHandler(id: string, handler: EventHandler): void {
  eventHandlers.set(id, handler);
}

export async function sendToChannel(
  id: string,
  target: ChannelTarget,
  message: { text: string },
): Promise<{ platform: string; id: string } | null> {
  const channel = channels.get(id);
  if (!channel?.enabled) return null;
  return channel.plugin.send(target, message);
}

export function listChannels(): { id: string; protocol: string; enabled: boolean; agentId: string }[] {
  return [...channels.entries()].map(([id, c]) => ({
    id,
    protocol: c.plugin.protocol,
    enabled: c.enabled,
    agentId: c.agentId,
  }));
}

export function getChannel(id: string): RegisteredChannel | undefined {
  return channels.get(id);
}

export async function stopAllChannels(): Promise<void> {
  const promises = [...channels.keys()].map((id) =>
    stopChannel(id).catch((e) =>
      console.error(`[channels] Error stopping ${id}: ${(e as Error).message}`)
    )
  );
  await Promise.allSettled(promises);
}
