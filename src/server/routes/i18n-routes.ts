import { type RouteHandler } from './_helpers.ts';
import { handleI18nApi } from '../../i18n/api.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/i18n\//,
    handler: async (_req, path) => {
      const i18nRes = await handleI18nApi(path);
      if (i18nRes) return i18nRes;
      return null;
    },
  },
];
