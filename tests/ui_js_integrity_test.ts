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

Deno.test('UI JS output is syntactically valid JavaScript', async () => {
  const { serveUi } = await import('../src/server/ui/mod.ts');
  const html = await serveUi('en').text();
  const { js } = getScriptJs(html);

  try {
    new Function(js);
  } catch (e: unknown) {
    const msg = e instanceof SyntaxError ? e.message : String(e);
    throw new Error(`Generated UI JS syntax error: ${msg}`);
  }
});

Deno.test('Prompt Lab JS functions are present', async () => {
  const { serveUi } = await import('../src/server/ui/mod.ts');
  const html = await serveUi('en').text();
  const { js } = getScriptJs(html);

  const required = [
    'function switchPLTab',
    'function loadPromptLab',
    'function renderPLStats',
    'function renderPromptTemplates',
    'function selectPromptTemplate',
    'function showPromptCreateModal',
    'function savePromptTemplate',
    'function deletePromptTemplate',
    'function showTestRunModal',
    'function closeTestRunModal',
    'function recordTestRun',
    'function renderPromptRuns',
    'function generatePLVariations',
    'function applyVariation',
    'function generatePrompt',
    'function useGeneratedPrompt',
    'function copyGeneratedPrompt',
    'function loadABTests',
    'function renderABTests',
    'function selectABTest',
    'function showABTestCreateModal',
    'function closeABTestModal',
    'function createABTest',
    'function updateABTestStatus',
    'function plPauseABTest',
    'function plResumeABTest',
    'function plCompleteABTest',
  ];

  for (const fn of required) {
    assertEquals(
      js.includes(fn),
      true,
      `Missing Prompt Lab function: ${fn}`,
    );
  }
});

Deno.test('Prompt Lab page HTML has expected structure', async () => {
  const html = await (await import('../src/server/ui/mod.ts')).serveUi('en').text();

  const requiredIds = [
    'id="pl-tab-templates"',
    'id="pl-tab-abtests"',
    'id="pl-tab-generator"',
    'id="pl-templates"',
    'id="pl-editor-title"',
    'id="pl-editor-text"',
    'id="pl-editor-actions"',
    'id="pl-editor-btns"',
    'id="pl-variables"',
    'id="pl-runs-list"',
    'id="pl-stats"',
    'id="pl-abtests-list"',
    'id="pl-abtest-detail"',
    'id="pl-abtest-modal"',
    'id="pl-testrun-modal"',
    'id="pl-gen-task"',
    'id="pl-gen-result"',
    'id="pl-gen-output"',
    'id="page-promptlab"',
  ];

  for (const id of requiredIds) {
    assertEquals(
      html.includes(id),
      true,
      `Missing Prompt Lab element: ${id}`,
    );
  }
});

Deno.test('Generated JS is free of template-literal escaping gotchas', async () => {
  const { serveUi } = await import('../src/server/ui/mod.ts');
  const html = await serveUi('en').text();
  const { js } = getScriptJs(html);

  // Verify split(/\\n/) exists — the correct pattern for splitting textarea values on newlines
  // In template literals, \\\\n produces \\n which the JS parser sees as regex /\\n/
  const correctSplit = js.includes('split(/\\n/)');
  assertEquals(
    correctSplit,
    true,
    'Missing split(/\\\\n/) — the prompt lab generator needs this for textarea line splitting',
  );
});
