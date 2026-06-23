import { handleApi } from '../src/server/new-router.ts';
import { assertEquals } from '@std/assert';

function buildUrl(page: number, section: string) {
  return `http://localhost/api/phase2/page${page}/${section}`;
}

Deno.test(
  'Phase2 endpoints coverage: pages 1-6, sections content/config/state/stats (dev mode only)',
  async () => {
    Deno.env.set('CORTEX_DEV_MODE', '1');
    try {
      const sections = ['content', 'config', 'state', 'stats'];
      for (let p = 1; p <= 6; p++) {
        for (const s of sections) {
          const req = new Request(buildUrl(p, s), { method: 'GET' });
          const res = await handleApi(req);
          if (!res) throw new Error(`No response for page ${p} ${s}`);
          const body = await res.json();
          assertEquals(body.ok, true, `page${p} ${s} should return ok`);
          assertEquals(body.page, p, `page should be ${p}`);
          assertEquals(body.section, s, `section should be ${s}`);
        }
      }
    } finally {
      Deno.env.delete('CORTEX_DEV_MODE');
    }
  },
);
