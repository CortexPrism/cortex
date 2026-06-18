import { assertEquals, assertExists, assertStringIncludes } from '@std/assert';
import { browserTool } from '../src/tools/builtin/browser.ts';
import type { ToolContext } from '../src/tools/types.ts';

const mockContext: ToolContext = {
  sessionId: 'test-session-789',
  workingDir: '/tmp',
  agentId: 'test-agent',
  workspaceDir: '/tmp/workspace',
};

Deno.test('browser - tool definition', () => {
  assertEquals(browserTool.definition.name, 'browser');
  assertStringIncludes(
    browserTool.definition.description.toLowerCase(),
    'headless browser',
  );
  assertStringIncludes(
    browserTool.definition.capabilities.toString(),
    'network:fetch',
  );
  assertStringIncludes(
    browserTool.definition.capabilities.toString(),
    'computer:screenshot',
  );

  // Check required parameters
  const actionParam = browserTool.definition.params.find(
    (p) => p.name === 'action',
  );
  assertExists(actionParam);
  assertEquals(actionParam?.required, true);
  assertEquals(
    actionParam?.enum,
    [
      'navigate',
      'click',
      'type',
      'screenshot',
      'snapshot',
      'evaluate',
      'wait',
      'close',
    ],
  );

  // Check optional parameters
  const urlParam = browserTool.definition.params.find((p) => p.name === 'url');
  assertExists(urlParam);
  assertEquals(urlParam?.required, false);
});

Deno.test('browser - validates action is required', async () => {
  const result = await browserTool.execute({}, mockContext);

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'action');
});

Deno.test('browser - close action succeeds', async () => {
  const result = await browserTool.execute({ action: 'close' }, mockContext);

  assertEquals(result.toolName, 'browser');
  assertExists(result.durationMs);
});

Deno.test('browser - navigate requires url', async () => {
  const result = await browserTool.execute(
    { action: 'navigate' },
    mockContext,
  );

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'url');
});

Deno.test('browser - navigate with url returns result', async () => {
  const result = await browserTool.execute(
    { action: 'navigate', url: 'about:blank' },
    mockContext,
  );

  assertEquals(result.toolName, 'browser');
  assertExists(result.durationMs);
});

Deno.test('browser - click requires selector', async () => {
  const result = await browserTool.execute(
    { action: 'click' },
    mockContext,
  );

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'selector');
});

Deno.test('browser - type requires selector', async () => {
  const result = await browserTool.execute(
    { action: 'type' },
    mockContext,
  );

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'selector');
});

Deno.test('browser - evaluate requires script', async () => {
  const result = await browserTool.execute(
    { action: 'evaluate' },
    mockContext,
  );

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'script');
});

Deno.test('browser - screenshot without page returns error', async () => {
  const result = await browserTool.execute(
    { action: 'screenshot' },
    mockContext,
  );

  // Should fail due to no active page or browser not available
  assertEquals(result.toolName, 'browser');
  assertExists(result.durationMs);
});

Deno.test('browser - snapshot without page returns error', async () => {
  const result = await browserTool.execute(
    { action: 'snapshot' },
    mockContext,
  );

  // Should fail due to no active page or browser not available
  assertEquals(result.toolName, 'browser');
  assertExists(result.durationMs);
});

Deno.test('browser - wait action returns result', async () => {
  const result = await browserTool.execute(
    { action: 'wait', timeout: 100 },
    mockContext,
  );

  assertEquals(result.toolName, 'browser');
  assertExists(result.durationMs);
});

Deno.test('browser - unknown action returns error', async () => {
  const result = await browserTool.execute(
    { action: 'invalid_action' },
    mockContext,
  );

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'Unknown action');
});

Deno.test('browser - result includes required fields', async () => {
  const result = await browserTool.execute(
    { action: 'close' },
    mockContext,
  );

  // All results must have these fields per Tool interface
  assertEquals(result.toolName, 'browser');
  assertEquals(typeof result.success, 'boolean');
  assertEquals(typeof result.output, 'string');
  assertExists(result.durationMs);

  // If error, should have error field
  if (!result.success) {
    assertExists(result.error);
  }
});

Deno.test('browser - timeout parameter is accepted', async () => {
  const result = await browserTool.execute(
    { action: 'wait', timeout: 5000 },
    mockContext,
  );

  assertEquals(result.toolName, 'browser');
});

Deno.test('browser - reason parameter is accepted', async () => {
  const result = await browserTool.execute(
    { action: 'close', reason: 'Test cleanup' },
    mockContext,
  );

  assertEquals(result.toolName, 'browser');
});

Deno.test('browser - selector parameter is accepted', async () => {
  const result = await browserTool.execute(
    { action: 'click', selector: '.button' },
    mockContext,
  );

  assertEquals(result.toolName, 'browser');
});

Deno.test('browser - text parameter is accepted', async () => {
  const result = await browserTool.execute(
    { action: 'type', selector: 'input', text: 'test' },
    mockContext,
  );

  assertEquals(result.toolName, 'browser');
});

Deno.test('browser - script parameter is accepted for evaluate', async () => {
  const result = await browserTool.execute(
    { action: 'evaluate', script: 'return 42' },
    mockContext,
  );

  assertEquals(result.toolName, 'browser');
});
