import { checkAuthRateLimit, json, type RouteHandler } from './_helpers.ts';
import {
  adminResetUserPassword,
  changePassword,
  changeUserPassword,
  clearSessionCookie,
  createApiToken,
  createSession,
  deleteUser,
  destroyAllUserSessions,
  destroySession,
  hasPassword,
  listApiTokens,
  listUsers,
  listUserSessions,
  parseCookies,
  revokeApiToken,
  setSessionCookie,
  setupPassword,
  updateUserProfile,
  validateSession,
  verifyPassword,
  verifyUserPassword,
} from '../auth.ts';
import { loadConfig } from '../../config/config.ts';
import { getIdentity } from './auth-guard.ts';
import { extractIdentity } from '../auth.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/auth\/status$/,
    handler: async (req) => {
      const pwSet = await hasPassword();
      const config = await loadConfig();
      const identity = await extractIdentity(req);
      if (identity.type === 'user') {
        return json({
          authenticated: true,
          user: {
            id: identity.userId,
            username: identity.username,
            teams: identity.teamIds,
            currentTeam: identity.currentTeamId,
            isInstanceAdmin: identity.isInstanceAdmin,
          },
          hasPassword: pwSet,
          requireAuth: config.webAuth?.requireAuth !== false,
        });
      }
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
        const session = await createSession();
        return json(
          { success: true, sessionId: session.id },
          201,
          setSessionCookie(session.id, req),
        );
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
      const body = await req.json() as { username?: string; password: string };
      const { username, password } = body;

      if (!password) {
        return json({ error: 'Password required' }, 400);
      }

      if (username) {
        const user = await verifyUserPassword(username, password);
        if (user) {
          const session = await createSession(user.id, user.username, clientIp);
          return json(
            {
              success: true,
              sessionId: session.id,
              user: { id: user.id, username: user.username },
            },
            200,
            setSessionCookie(session.id, req),
          );
        }
        return json({ error: 'Invalid username or password' }, 401);
      }

      const valid = await verifyPassword(password);
      if (!valid) return json({ error: 'Invalid password' }, 401);
      const session = await createSession(undefined, undefined, clientIp);
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
      const identity = await extractIdentity(req);
      const cookies = parseCookies(req.headers.get('cookie') || '');
      const sessionId = cookies['cortex_session'];
      const valid = sessionId ? validateSession(sessionId) : false;

      if (identity.type === 'user') {
        return json({
          authenticated: true,
          user: { id: identity.userId, username: identity.username },
        });
      }
      return json({ authenticated: valid });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/auth\/change-password$/,
    handler: async (req) => {
      const identity = await extractIdentity(req);
      const body = await req.json() as {
        oldPassword: string;
        newPassword: string;
      };

      try {
        if (identity.type === 'user' && identity.userId) {
          const ok = await changeUserPassword(identity.userId, body.oldPassword, body.newPassword);
          if (!ok) return json({ error: 'Current password is incorrect' }, 401);
          return json({ success: true });
        }

        const pwExists = await hasPassword();
        if (pwExists) {
          const cookies = parseCookies(req.headers.get('cookie') || '');
          const sessionId = cookies['cortex_session'];
          if (!sessionId || !validateSession(sessionId)) {
            return json({ error: 'Unauthorized' }, 401);
          }
        }
        const success = await changePassword(body.oldPassword, body.newPassword);
        if (!success) {
          return json({ error: 'Current password is incorrect' }, 401);
        }
        const session = await createSession();
        return json({ success: true }, 200, setSessionCookie(session.id));
      } catch (e) {
        return json({ error: (e as Error).message }, 400);
      }
    },
  },

  // ── Session Management ──────────────────────────────────────
  {
    method: 'GET',
    pattern: /^\/api\/auth\/sessions$/,
    handler: async (req) => {
      const identity = await extractIdentity(req);
      if (identity.type !== 'user' || !identity.userId) {
        return json({ error: 'Authentication required' }, 401);
      }
      const sessions = await listUserSessions(identity.userId);
      return json(sessions.map((s) => ({
        id: s.id,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        lastActivity: s.lastActivity,
        ipAddress: s.ipAddress,
      })));
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/auth\/sessions\/([^/]+)$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/auth\/sessions\/([^/]+)$/);
      if (!m) return json({ error: 'Session not found' }, 404);
      const identity = await extractIdentity(req);
      if (identity.type !== 'user' || !identity.userId) {
        return json({ error: 'Authentication required' }, 401);
      }
      const cookies = parseCookies(req.headers.get('cookie') || '');
      const currentSessionId = cookies['cortex_session'];
      if (m[1] === currentSessionId) {
        return json({ error: 'Cannot revoke current session. Use logout instead.' }, 400);
      }
      destroySession(m[1]);
      return json({ ok: true });
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/auth\/sessions$/,
    handler: async (req) => {
      const identity = await extractIdentity(req);
      if (identity.type !== 'user' || !identity.userId) {
        return json({ error: 'Authentication required' }, 401);
      }
      const cookies = parseCookies(req.headers.get('cookie') || '');
      const currentSessionId = cookies['cortex_session'];
      await destroyAllUserSessions(identity.userId, currentSessionId);
      return json({ ok: true });
    },
  },

  // ── User Profile (self-service) ─────────────────────────────
  {
    method: 'GET',
    pattern: /^\/api\/auth\/profile$/,
    handler: async (req) => {
      const identity = await extractIdentity(req);
      if (identity.type !== 'user' || !identity.userId) {
        return json({ error: 'Authentication required' }, 401);
      }
      const { getUserById } = await import('../auth.ts');
      const user = await getUserById(identity.userId);
      if (!user) return json({ error: 'User not found' }, 404);
      return json({
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        email: user.email,
        disabledAt: user.disabled_at,
        isInstanceAdmin: identity.isInstanceAdmin,
      });
    },
  },
  {
    method: 'PATCH',
    pattern: /^\/api\/auth\/profile$/,
    handler: async (req) => {
      const identity = await extractIdentity(req);
      if (identity.type !== 'user' || !identity.userId) {
        return json({ error: 'Authentication required' }, 401);
      }
      const body = await req.json() as { displayName?: string; email?: string };
      const ok = await updateUserProfile(identity.userId, {
        displayName: body.displayName,
        email: body.email,
      });
      if (!ok) return json({ error: 'User not found' }, 404);
      return json({ ok: true });
    },
  },

  // ── API Token Management ────────────────────────────────────
  {
    method: 'GET',
    pattern: /^\/api\/auth\/tokens$/,
    handler: async (req) => {
      const identity = await extractIdentity(req);
      if (identity.type !== 'user') {
        return json({ error: 'Authentication required' }, 401);
      }
      const tokens = await listApiTokens(identity.userId!);
      return json(tokens);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/auth\/tokens$/,
    handler: async (req) => {
      const identity = await extractIdentity(req);
      if (identity.type !== 'user') {
        return json({ error: 'Authentication required' }, 401);
      }
      const body = await req.json() as { name?: string; teamIds?: string[]; expiresDays?: number };
      if (!body.name?.trim()) {
        return json({ error: 'Token name required' }, 400);
      }
      try {
        const result = await createApiToken(
          identity.userId!,
          body.name.trim(),
          body.teamIds,
          body.expiresDays,
        );
        return json(result, 201);
      } catch (e) {
        return json({ error: (e as Error).message }, 400);
      }
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/auth\/tokens\/([^/]+)$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/auth\/tokens\/([^/]+)$/);
      if (!m) {
        return json({ error: 'Token not found' }, 404);
      }
      const identity = await extractIdentity(req);
      if (identity.type !== 'user') {
        return json({ error: 'Authentication required' }, 401);
      }
      const ok = await revokeApiToken(identity.userId!, m[1]);
      if (!ok) return json({ error: 'Token not found' }, 404);
      return json({ ok: true });
    },
  },

  // ── User Management (instance admin) ────────────────────────
  {
    method: 'GET',
    pattern: /^\/api\/users$/,
    handler: async (req) => {
      const identity = await extractIdentity(req);
      if (!identity.isInstanceAdmin) {
        return json({ error: 'Forbidden' }, 403);
      }
      const users = await listUsers();
      return json(users);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/users$/,
    handler: async (req) => {
      const identity = await extractIdentity(req);
      if (!identity.isInstanceAdmin) {
        return json({ error: 'Forbidden' }, 403);
      }
      const body = await req.json() as {
        username: string;
        password: string;
        displayName?: string;
        email?: string;
        isAdmin?: boolean;
      };
      try {
        const { createUser } = await import('../auth.ts');
        const user = await createUser(
          body.username,
          body.password,
          body.displayName,
          body.email,
          body.isAdmin ?? false,
        );
        return json(user, 201);
      } catch (e) {
        return json({ error: (e as Error).message }, 400);
      }
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/users\/([^/]+)$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/users\/([^/]+)$/);
      if (!m) return json({ error: 'Not found' }, 404);
      const identity = await extractIdentity(req);
      if (!identity.isInstanceAdmin && identity.userId !== m[1]) {
        return json({ error: 'Forbidden' }, 403);
      }
      const { getUserById } = await import('../auth.ts');
      const user = await getUserById(m[1]);
      if (!user) return json({ error: 'User not found' }, 404);
      return json(user);
    },
  },
  {
    method: 'PATCH',
    pattern: /^\/api\/users\/([^/]+)$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/users\/([^/]+)$/);
      if (!m) return json({ error: 'Not found' }, 404);
      const identity = await extractIdentity(req);
      if (!identity.isInstanceAdmin && identity.userId !== m[1]) {
        return json({ error: 'Forbidden' }, 403);
      }
      const body = await req.json() as { displayName?: string; email?: string };
      const ok = await updateUserProfile(m[1], {
        displayName: body.displayName,
        email: body.email,
      });
      if (!ok) return json({ error: 'User not found' }, 404);
      return json({ ok: true });
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/users\/([^/]+)$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/users\/([^/]+)$/);
      if (!m) return json({ error: 'Not found' }, 404);
      const identity = await extractIdentity(req);
      if (!identity.isInstanceAdmin) {
        return json({ error: 'Forbidden' }, 403);
      }
      const ok = await deleteUser(m[1]);
      if (!ok) return json({ error: 'User not found' }, 404);
      return json({ ok: true });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/users\/([^/]+)\/reset-password$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/users\/([^/]+)\/reset-password$/);
      if (!m) return json({ error: 'Not found' }, 404);
      const identity = await extractIdentity(req);
      if (!identity.isInstanceAdmin) {
        return json({ error: 'Forbidden' }, 403);
      }
      const body = await req.json() as { newPassword: string };
      try {
        const ok = await adminResetUserPassword(m[1], body.newPassword);
        if (!ok) return json({ error: 'User not found' }, 404);
        return json({ ok: true });
      } catch (e) {
        return json({ error: (e as Error).message }, 400);
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/users\/([^/]+)\/disable$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/users\/([^/]+)\/disable$/);
      if (!m) return json({ error: 'Not found' }, 404);
      const identity = await extractIdentity(req);
      if (!identity.isInstanceAdmin) {
        return json({ error: 'Forbidden' }, 403);
      }
      const { disableUser } = await import('../auth.ts');
      const ok = await disableUser(m[1]);
      if (!ok) return json({ error: 'User not found' }, 404);
      return json({ ok: true });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/users\/([^/]+)\/enable$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/users\/([^/]+)\/enable$/);
      if (!m) return json({ error: 'Not found' }, 404);
      const identity = await extractIdentity(req);
      if (!identity.isInstanceAdmin) {
        return json({ error: 'Forbidden' }, 403);
      }
      const { enableUser } = await import('../auth.ts');
      const ok = await enableUser(m[1]);
      if (!ok) return json({ error: 'User not found' }, 404);
      return json({ ok: true });
    },
  },

  // ── Onboarding Status ───────────────────────────────────────
  {
    method: 'GET',
    pattern: /^\/api\/onboarding\/status$/,
    handler: async () => {
      const config = await loadConfig();
      const onboarding =
        (config as unknown as Record<string, unknown>).onboarding as Record<string, unknown> || {};
      const steps = (onboarding.steps as Record<string, boolean>) || {};
      const userProfile =
        ((config as unknown as Record<string, unknown>).userProfile as Record<string, unknown>) ||
        {};
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
