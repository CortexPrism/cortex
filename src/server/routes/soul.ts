import { type RouteHandler, json } from './_helpers.ts';
import { PATHS } from '../../config/paths.ts';
import { exists } from '@std/fs';
import { generatePersonalitySoul } from '../../agent/soul.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/soul\/templates$/,
    handler: async () => {
      const { PERSONALITY_TEMPLATES, TEMPLATE_DESCRIPTIONS } = await import('../../agent/soul.ts');
      const templates = Object.entries(PERSONALITY_TEMPLATES).map(([id, content]) => ({
        id,
        description: TEMPLATE_DESCRIPTIONS[id] ?? '',
        content,
      }));
      return json(templates);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/soul\/(soul|user|memory)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/soul\/(soul|user|memory)$/);
      if (!m) return json({ error: 'Not found' }, 404);
      const fileKey = m[1] as 'soul' | 'user' | 'memory';
      const filePath = fileKey === 'soul'
        ? PATHS.soulFile
        : fileKey === 'user'
        ? PATHS.userFile
        : PATHS.memoryFile;
      const content = (await exists(filePath)) ? await Deno.readTextFile(filePath) : '';
      return json({ content, path: filePath });
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/soul\/(soul|user|memory)$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/soul\/(soul|user|memory)$/);
      if (!m) return json({ error: 'Not found' }, 404);
      const fileKey = m[1] as 'soul' | 'user' | 'memory';
      const filePath = fileKey === 'soul'
        ? PATHS.soulFile
        : fileKey === 'user'
        ? PATHS.userFile
        : PATHS.memoryFile;
      const body = await req.json() as { content?: string; template?: string };
      await Deno.mkdir(PATHS.configDir, { recursive: true });
      const finalContent = (body.template && fileKey === 'soul')
        ? generatePersonalitySoul(body.template)
        : (body.content ?? '');
      await Deno.writeTextFile(filePath, finalContent);
      return json({ ok: true });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/soul\/memory\/append$/,
    handler: async (req) => {
      const { note } = await req.json() as { note: string };
      const ts = new Date().toISOString();
      await Deno.mkdir(PATHS.configDir, { recursive: true });
      await Deno.writeTextFile(PATHS.memoryFile, `\n---\n[${ts}]\n${note}\n`, { append: true });
      return json({ ok: true });
    },
  },
];
