import type { RouteHandler } from './_helpers.ts';

export const routes: RouteHandler[] = [
  {
    method: 'POST',
    pattern: /^\/api\/webhooks\//,
    handler: async (req) => {
      const { handleWebhookRequest } = await import('../../../../../src/triggers/webhook.ts');
      const result = await handleWebhookRequest(req);
      if (result) return result;
      return null;
    },
  },
];
