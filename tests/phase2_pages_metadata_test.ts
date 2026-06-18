import { handleApi } from '../src/server/router.ts';
import { assertEquals } from 'https://deno.land/std@0.203.0/testing/asserts.ts';

Deno.test('Phase2 pages metadata endpoint', async () => {
  const req = new Request('http://localhost/api/phase2/pages', { method: 'GET' });
  const res = await handleApi(req);
  if (!res) throw new Error('No response');
  const body = await res.json();
  assertEquals(body.ok, true, 'ok should be true');
  assertEquals(Array.isArray(body.pages), true, 'pages should be an array');
  assertEquals(body.pages.length, 6, 'should contain 6 pages metadata');
  // verify first entry structure
  const first = body.pages[0];
  assertEquals(typeof first.id, 'number');
  assertEquals(typeof first.slug, 'string');
  assertEquals(typeof first.title, 'string');
});
