import { handleTriggerEvent, verifyWebhookSignature, checkIpAllowed } from './manager.ts';
import { listTriggers } from './manager.ts';
import type { TriggerEvent } from './types.ts';

export interface WebhookJobCreator {
  createJob(agentId: string, prompt: string): Promise<unknown>;
}

let jobCreator: WebhookJobCreator | null = null;

export function setWebhookJobCreator(creator: WebhookJobCreator): void {
  jobCreator = creator;
}

export async function handleWebhookRequest(req: Request): Promise<Response | null> {
  const url = new URL(req.url);

  const match = url.pathname.match(/^\/api\/webhooks\/(.+?)(\/.*)?$/);
  if (!match) return null;

  const triggerName = match[1];
  const trigger = listTriggers().find((t) => t.name === triggerName);
  if (!trigger || !trigger.enabled || trigger.source !== 'webhook' || !trigger.webhook) {
    return new Response(JSON.stringify({ error: 'Webhook not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!checkIpAllowed(triggerName, req.headers.get('x-forwarded-for') ?? '127.0.0.1')) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await req.text();
  const sigHeader = req.headers.get('x-hub-signature-256') ??
    req.headers.get('x-gitlab-token') ??
    req.headers.get('x-signature');

  if (!(await verifyWebhookSignature(triggerName, body, sigHeader))) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(body) as Record<string, unknown>;
  } catch {
    payload = { raw: body };
  }

  const eventType = req.headers.get('x-github-event') ??
    req.headers.get('x-gitlab-event') ??
    req.headers.get('x-event-type') ?? 'unknown';

  if (trigger.webhook.events[0] !== '*' && !trigger.webhook.events.includes(eventType)) {
    return new Response(null, { status: 204 });
  }

  const event: TriggerEvent = {
    triggerName,
    source: 'webhook',
    timestamp: new Date(),
    data: { ...payload, provider_event: eventType },
  };

  if (!jobCreator) {
    return new Response(JSON.stringify({ error: 'Job creator not initialized' }), { status: 500 });
  }

  const job = await handleTriggerEvent(event, (agentId, prompt) =>
    jobCreator!.createJob(agentId, prompt)
  );

  return new Response(JSON.stringify({ accepted: true, job }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  });
}
