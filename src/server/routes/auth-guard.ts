import { requireAuth } from '../auth.ts';

export async function authGuard(req: Request): Promise<Response | null> {
  const authResult = await requireAuth(req);
  if (!authResult.authenticated) {
    return authResult.response ??
      new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
  }
  return null;
}
