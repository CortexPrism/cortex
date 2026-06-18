import { handleApi } from '../src/server/router.ts';
import { assertEquals } from 'https://deno.land/std@0.203.0/testing/asserts.ts';

Deno.test('Phase2 page1 content endpoint', async () => {
  const req = new Request('http://localhost/api/phase2/page1/content', { method: 'GET' });
  const res = await handleApi(req);
  if (!res) throw new Error('No response');
  const body = await res.json();
  await assertEquals(body.ok, true);
  await assertEquals(body.page, 1);
  await assertEquals(body.section, 'content');
});

Deno.test('Phase2 page3 state endpoint', async () => {
  const req = new Request('http://localhost/api/phase2/page3/state', { method: 'GET' });
  const res = await handleApi(req);
  if (!res) throw new Error('No response');
  const body = await res.json();
  await assertEquals(body.ok, true);
  await assertEquals(body.page, 3);
  await assertEquals(body.section, 'state');
});
