import { type RouteHandler, json, err } from './_helpers.ts';
import { PATHS } from '../../config/paths.ts';
import { join, normalize } from '@std/path';

export const routes: RouteHandler[] = [
  {
    method: 'POST',
    pattern: /^\/api\/upload$/,
    handler: async (req) => {
      const body = await req.json() as {
        filename: string;
        mimeType: string;
        data: string;
      };
      if (!body.filename?.trim() || !body.data) return err('Missing filename or data', 400);
      if (typeof body.data !== 'string') return err('Data must be a base64 string', 400);
      const sanitized = body.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const uploadDir = normalize(join(PATHS.dataDir, 'uploads'));
      await Deno.mkdir(uploadDir, { recursive: true });
      const filePath = normalize(join(uploadDir, `${Date.now()}_${sanitized}`));
      if (!filePath.startsWith(uploadDir + '/') && filePath !== uploadDir) {
        return err('Invalid file path', 400);
      }
      const binary = Uint8Array.from(atob(body.data), (c) => c.charCodeAt(0));
      await Deno.writeFile(filePath, binary);
      return json({
        ok: true,
        path: filePath,
        filename: sanitized,
        mimeType: body.mimeType || 'application/octet-stream',
      });
    },
  },
];
