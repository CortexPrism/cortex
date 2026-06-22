import { type RouteHandler, json, err } from './_helpers.ts';
import { PATHS } from '../../../../../src/config/paths.ts';
import { join } from '@std/path';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/dashboard\/config$/,
    handler: async () => {
      const configPath = join(PATHS.configDir, 'dashboard.json');
      let config = { widgets: [] };
      try {
        config = JSON.parse(await Deno.readTextFile(configPath));
      } catch { /* defaults */ }
      return json(config);
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/dashboard\/config$/,
    handler: async (req) => {
      try {
        const body = await req.json();
        await Deno.writeTextFile(
          join(PATHS.configDir, 'dashboard.json'),
          JSON.stringify(body, null, 2),
        );
        return json({ ok: true });
      } catch (e) {
        return err((e as Error).message);
      }
    },
  },
];
