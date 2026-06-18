import { handleApi } from '../src/server/router.ts';
import { assertEquals } from 'https://deno.land/std@0.203.0/testing/asserts.ts';

function buildUrl(page: number, section: string) {
  return `http://localhost/api/phase2/page${page}/${section}`;
}

Deno.test('Phase2 endpoints coverage: pages 1-6, sections content/config/state/stats', async () => {
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
});
