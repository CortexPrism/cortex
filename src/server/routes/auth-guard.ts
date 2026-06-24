import { requireAuth } from '../auth.ts';
import type { RequestIdentity } from '../identity.ts';
import { createAnonymousIdentity } from '../identity.ts';

const identityMap = new WeakMap<Request, RequestIdentity>();

export async function authGuard(req: Request): Promise<Response | null> {
  const authResult = await requireAuth(req);
  if (!authResult.authenticated) {
    return authResult.response ??
      new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
  }
  const identity = authResult.identity ?? createAnonymousIdentity();
  identityMap.set(req, identity);
  return null;
}

export function getIdentity(req: Request): RequestIdentity {
  return identityMap.get(req) ?? createAnonymousIdentity();
}
