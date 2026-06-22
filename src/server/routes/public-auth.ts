import { type RouteHandler, json, checkAuthRateLimit, savePartialProfile } from './_helpers.ts';
import {
  hasPassword,
  createSession,
  setSessionCookie,
  parseCookies,
  destroySession,
  clearSessionCookie,
  validateSession,
  verifyPassword,
  setupPassword,
  changePassword,
} from '../auth.ts';
import { loadConfig, saveConfig } from '../../config/config.ts';
import type { ProviderKind, ProviderConfig } from '../../config/config.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/auth\/status$/,
    handler: async () => {
      const pwSet = await hasPassword();
      const config = await loadConfig();
      return json({
        authenticated: false,
        hasPassword: pwSet,
        requireAuth: config.webAuth?.requireAuth !== false,
      });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/auth\/setup-password$/,
    handler: async (req) => {
      const already = await hasPassword();
      if (already) return json({ error: 'Password already set' }, 400);
      const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
      if (!checkAuthRateLimit(clientIp)) {
        return json({ error: 'Too many attempts. Try again later.' }, 429);
      }
      const { password } = await req.json() as { password: string };
      try {
        await setupPassword(password);
        const session = createSession();
        return json({ success: true, sessionId: session.id }, 201, setSessionCookie(session.id, req));
      } catch (e) {
        return json({ error: (e as Error).message }, 400);
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/auth\/login$/,
    handler: async (req) => {
      const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
      if (!checkAuthRateLimit(clientIp)) {
        return json({ error: 'Too many login attempts. Try again later.' }, 429);
      }
      const { password } = await req.json() as { password: string };
      const valid = await verifyPassword(password);
      if (!valid) return json({ error: 'Invalid password' }, 401);
      const session = createSession(clientIp);
      return json({ success: true, sessionId: session.id }, 200, setSessionCookie(session.id, req));
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/auth\/logout$/,
    handler: async (req) => {
      const cookies = parseCookies(req.headers.get('cookie') || '');
      const sessionId = cookies['cortex_session'];
      if (sessionId) destroySession(sessionId);
      return json({ success: true }, 200, clearSessionCookie(req));
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/auth\/check$/,
    handler: async (req) => {
      const cookies = parseCookies(req.headers.get('cookie') || '');
      const sessionId = cookies['cortex_session'];
      const valid = sessionId ? validateSession(sessionId) : false;
      return json({ authenticated: valid });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/auth\/change-password$/,
    handler: async (req) => {
      const pwExists = await hasPassword();
      if (pwExists) {
        const cookies = parseCookies(req.headers.get('cookie') || '');
        const sessionId = cookies['cortex_session'];
        if (!sessionId || !validateSession(sessionId)) {
          return json({ error: 'Unauthorized' }, 401);
        }
      }
      const { oldPassword, newPassword } = await req.json() as {
        oldPassword: string;
        newPassword: string;
      };
      try {
        const success = await changePassword(oldPassword, newPassword);
        if (!success) {
          return json({ error: 'Current password is incorrect' }, 401);
        }
        const session = createSession();
        return json({ success: true }, 200, setSessionCookie(session.id));
      } catch (e) {
        return json({ error: (e as Error).message }, 400);
      }
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/onboarding\/status$/,
    handler: async () => {
      const config = await loadConfig();
      const onboarding =
        (config as unknown as Record<string, unknown>).onboarding as Record<string, unknown> || {};
      const steps = (onboarding.steps as Record<string, boolean>) || {};
      const userProfile =
        ((config as unknown as Record<string, unknown>).userProfile as Record<string, unknown>) || {};
      return json({
        completed: onboarding.completed === true,
        currentStep: onboarding.currentStep ?? null,
        hasPassword: await hasPassword(),
        hasProvider: !!config.providers[config.defaultProvider],
        hasProfile: !!((userProfile as Record<string, unknown>)?.completed),
        hasSoul: !!((userProfile as Record<string, unknown>)?.completed),
        steps,
      });
    },
  },
];
