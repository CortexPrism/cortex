import type { TriggerConfig, TriggerEvent, RateLimit } from './types.ts';
import { WEBHOOK_PROVIDERS } from './types.ts';

const triggers: Map<string, TriggerConfig> = new Map();
const rateLimitBuckets: Map<string, { count: number; resetAt: number; lastAt: number }> = new Map();

export function registerTrigger(config: TriggerConfig): void {
  triggers.set(config.name, config);
}

export function unregisterTrigger(name: string): boolean {
  return triggers.delete(name);
}

export function getTrigger(name: string): TriggerConfig | undefined {
  return triggers.get(name);
}

export function listTriggers(): TriggerConfig[] {
  return [...triggers.values()];
}

export function checkRateLimit(triggerName: string, limit?: RateLimit): boolean {
  if (!limit) return true;

  const now = Date.now();
  const bucket = rateLimitBuckets.get(triggerName);

  if (!bucket || now > bucket.resetAt) {
    rateLimitBuckets.set(triggerName, {
      count: 1,
      resetAt: now + limit.perSeconds * 1000,
      lastAt: now,
    });
    return true;
  }

  if (now - bucket.lastAt < limit.cooldownSeconds * 1000) {
    return false;
  }

  if (bucket.count >= limit.count) {
    return false;
  }

  bucket.count++;
  bucket.lastAt = now;
  return true;
}

export async function handleTriggerEvent(
  event: TriggerEvent,
  createJob: (agentId: string, prompt: string) => Promise<unknown>,
): Promise<void> {
  const trigger = triggers.get(event.triggerName);
  if (!trigger || !trigger.enabled) return;

  if (!checkRateLimit(event.triggerName, trigger.rateLimit)) {
    return;
  }

  const prompt = renderTemplate(trigger.action.promptTemplate, event.data);

  try {
    await createJob(
      trigger.action.agent ?? 'default',
      prompt,
    );
  } catch (e) {
    console.error(`[triggers] Failed to create job for ${event.triggerName}: ${(e as Error).message}`);
  }
}

function renderTemplate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*(?:\|\s*(\w+))?\s*\}\}/g, (_match, key, filter) => {
    const value = key.split('.').reduce((obj: Record<string, unknown>, k: string) => {
      if (obj && typeof obj === 'object') return obj[k] as Record<string, unknown>;
      return undefined;
    }, data);

    if (value === undefined || value === null) return '';
    const str = typeof value === 'string' ? value : JSON.stringify(value);

    if (filter === 'length') return String((value as unknown[]).length);
    if (filter === 'join') {
      const arr = value as unknown[];
      return arr ? arr.join(', ') : '';
    }

    return str;
  });
}

export async function verifyWebhookSignature(
  triggerName: string,
  body: string,
  signatureHeader: string | null,
): Promise<boolean> {
  const trigger = triggers.get(triggerName);
  if (!trigger?.webhook) return true;

  const provider = trigger.webhook.providers
    .map((p) => WEBHOOK_PROVIDERS[p])
    .find(Boolean);

  if (!provider || !trigger.webhook.secretEnv) return true;

  const secret = trigger.webhook.secret ?? Deno.env.get(trigger.webhook.secretEnv ?? '');
  if (!secret || !signatureHeader) return false;

  const prefix = provider.signaturePrefix;
  const expectedSig = signatureHeader.startsWith(prefix)
    ? signatureHeader.slice(prefix.length)
    : signatureHeader;

  const encoder = new TextEncoder();
  const key = encoder.encode(secret);
  const data = encoder.encode(body);

  try {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key.buffer as ArrayBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    return await crypto.subtle.verify(
      'HMAC',
      cryptoKey,
      hexToBytes(expectedSig).buffer as ArrayBuffer,
      data.buffer as ArrayBuffer,
    );
  } catch {
    return false;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

export function checkIpAllowed(
  triggerName: string,
  remoteAddr: string,
): boolean {
  const trigger = triggers.get(triggerName);
  if (!trigger?.webhook?.allowedIps?.length) return true;

  const ip = remoteAddr.replace(/^::ffff:/, '');
  return trigger.webhook.allowedIps.some((cidr) => ipInCidr(ip, cidr));
}

function ipInCidr(ip: string, cidr: string): boolean {
  if (!cidr.includes('/')) return ip === cidr;

  const [range, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr, 10);
  if (isNaN(bits)) return false;

  const ipParts = ip.split('.').map(Number);
  const rangeParts = range.split('.').map(Number);

  if (ipParts.length !== 4 || rangeParts.length !== 4) return false;

  const ipInt = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
  const rangeInt = (rangeParts[0] << 24) | (rangeParts[1] << 16) | (rangeParts[2] << 8) | rangeParts[3];
  const mask = -1 << (32 - bits);

  return (ipInt & mask) === (rangeInt & mask);
}
