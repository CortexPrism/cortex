import { json, type RouteHandler } from './_helpers.ts';
import { changePassword } from '../auth.ts';

export const routes: RouteHandler[] = [
  {
    method: 'POST',
    pattern: /^\/api\/auth\/password\/change$/,
    handler: async (req) => {
      const body = await req.json() as { oldPassword: string; newPassword: string };
      const ok = await changePassword(body.oldPassword, body.newPassword);
      if (!ok) return json({ error: 'Current password is incorrect' }, 401);
      return json({ success: true });
    },
  },
];
