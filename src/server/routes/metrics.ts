import { type RouteHandler } from './_helpers.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/metrics$/,
    handler: async () => {
      const { renderPrometheus } = await import('../../observability/metrics.ts');
      const text = renderPrometheus();
      return new Response(text, {
        status: 200,
        headers: { 'Content-Type': 'text/plain; version=0.0.4' },
      });
    },
  },
];
