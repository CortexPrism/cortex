import { handleApi } from '../src/server/new-router.ts';
import { assertEquals } from '@std/assert';

Deno.test('Phase2 page1 content endpoint (dev mode only)', async () => {
  Deno.env.set('CORTEX_DEV_MODE', '1');
  try {
    const req = new Request('http://localhost/api/phase2/page1/content', { method: 'GET' });
    const res = await handleApi(req);
    if (!res) throw new Error('No response');
    const body = await res.json();
    await assertEquals(body.ok, true);
    await assertEquals(body.page, 1);
    await assertEquals(body.section, 'content');
  } finally {
    Deno.env.delete('CORTEX_DEV_MODE');
  }
});

Deno.test('Phase2 page3 state endpoint (dev mode only)', async () => {
  Deno.env.set('CORTEX_DEV_MODE', '1');
  try {
    const req = new Request('http://localhost/api/phase2/page3/state', { method: 'GET' });
    const res = await handleApi(req);
    if (!res) throw new Error('No response');
    const body = await res.json();
    await assertEquals(body.ok, true);
    await assertEquals(body.page, 3);
    await assertEquals(body.section, 'state');
  } finally {
    Deno.env.delete('CORTEX_DEV_MODE');
  }
});
