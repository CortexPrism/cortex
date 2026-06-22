import { assertEquals } from '@std/assert';

function getScriptJs(html: string): { js: string; lines: string[] } {
  const basePos = html.indexOf('const BASE');
  const scriptStart = html.lastIndexOf('<script>', basePos);
  const scriptEnd = html.indexOf('</script>', scriptStart);
  const js = html.slice(scriptStart + 8, scriptEnd);
  return { js, lines: js.split('\n') };
}

Deno.test('UI JS output has no broken string continuations', async () => {
  const { serveUi } = await import('../src/server/ui/mod.ts');
  const html = await serveUi('en').text();
  const { lines } = getScriptJs(html);

  const broken: Array<{ line: number; prev: string; curr: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*['"][);,]*\s*$/.test(line) && i > 0) {
      const prev = lines[i - 1].trimEnd();
      if (!/['"]\s*$/.test(prev) && !prev.endsWith('+')) {
        broken.push({ line: i + 1, prev: prev.slice(-40), curr: line });
      }
    }
  }
  assertEquals(broken.length, 0, `Found ${broken.length} potentially broken strings`);
});

Deno.test('UI JS output has all expected global functions', async () => {
  const { serveUi } = await import('../src/server/ui/mod.ts');
  const html = await serveUi('en').text();
  const { js } = getScriptJs(html);

  const required = [
    'fetchJSON(url,fallback)',
    'function toast',
    'function confirmAction',
    'function connect(',
    'function setBadge',
    'function newChat',
    'function loadAgentSelector',
    'function loadModelSelector',
    'function appendBubble',
    'function showPage',
    'function loadDashboard',
    'function loadSettings',
    'function loadSandboxPage',
    'function extendObservability',
    'function extendMetricsPage',
    'function extendSubAgentProcesses',
    'function switchSettingsExtTab',
    'function restorePage',
  ];

  for (const fn of required) {
    assertEquals(
      js.includes(fn),
      true,
      `Missing function: ${fn}`,
    );
  }
});

Deno.test('UI JS output has no literal control chars in strings', async () => {
  const { serveUi } = await import('../src/server/ui/mod.ts');
  const html = await serveUi('en').text();
  const { js } = getScriptJs(html);

  const broken = js.match(/\n'[);,\]\s]/g);
  assertEquals(broken, null, 'Found literal newlines before closing quotes');
});
