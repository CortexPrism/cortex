import { type RouteHandler, ensureCorsOrigin, _corsOrigin } from './_helpers.ts';
import { mergeSecurityHeaders } from '../security-headers.ts';

export const routes: RouteHandler[] = [
  {
    method: 'OPTIONS',
    pattern: /.*/,
    handler: async () => {
      await ensureCorsOrigin();
      const origin = _corsOrigin ?? 'same-origin';
      return new Response(null, {
        headers: mergeSecurityHeaders({
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        }),
      });
    },
  },
];
