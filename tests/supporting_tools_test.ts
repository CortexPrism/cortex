import { assertEquals, assertExists, assertStringIncludes } from '@std/assert';
import { jsonQueryTool } from '../src/tools/builtin/json_query.ts';
import { regexUtilsTool } from '../src/tools/builtin/regex_utils.ts';
import { envManagerTool } from '../src/tools/builtin/env_manager.ts';
import { codeSnippetTool } from '../src/tools/builtin/code_snippet.ts';
import type { ToolContext } from '../src/tools/types.ts';

const mockContext: ToolContext = {
  sessionId: 'test-session-support',
  workingDir: '/tmp',
  agentId: 'test-agent',
  workspaceDir: '/tmp/workspace',
};

// ═════════════════════════════════════════════════════════
// JSON Query Tests
// ═════════════════════════════════════════════════════════

Deno.test('json_query - tool definition', () => {
  assertEquals(jsonQueryTool.definition.name, 'json_query');
  assertStringIncludes(jsonQueryTool.definition.description, 'JSON');
});

Deno.test('json_query - reads object property', async () => {
  const json = JSON.stringify({ name: 'John', age: 30 });
  const result = await jsonQueryTool.execute(
    { json, path: '$.name', operation: 'read' },
    mockContext,
  );

  assertEquals(result.success, true);
  assertStringIncludes(result.output, 'John');
});

Deno.test('json_query - counts array items', async () => {
  const json = JSON.stringify({ items: [1, 2, 3, 4, 5] });
  const result = await jsonQueryTool.execute(
    { json, path: '$.items', operation: 'count' },
    mockContext,
  );

  assertEquals(result.success, true);
  assertStringIncludes(result.output, '5');
});

Deno.test('json_query - handles invalid json', async () => {
  const result = await jsonQueryTool.execute(
    { json: '{invalid}', path: '$.test', operation: 'read' },
    mockContext,
  );

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'Invalid JSON');
});

// ═════════════════════════════════════════════════════════
// Regex Utils Tests
// ═════════════════════════════════════════════════════════

Deno.test('regex_utils - tool definition', () => {
  assertEquals(regexUtilsTool.definition.name, 'regex_utils');
  assertStringIncludes(regexUtilsTool.definition.description, 'Regular');
});

Deno.test('regex_utils - matches pattern', async () => {
  const result = await regexUtilsTool.execute(
    {
      text: 'The year is 2026',
      operation: 'match',
      pattern: '\\d+',
    },
    mockContext,
  );

  assertEquals(result.success, true);
  assertStringIncludes(result.output, '2026');
});

Deno.test('regex_utils - tests pattern', async () => {
  const result = await regexUtilsTool.execute(
    {
      text: 'test@example.com',
      operation: 'test',
      pattern: '.*@.*',
    },
    mockContext,
  );

  assertEquals(result.success, true);
  assertStringIncludes(result.output, 'true');
});

Deno.test('regex_utils - replaces text', async () => {
  const result = await regexUtilsTool.execute(
    {
      text: 'Hello World',
      operation: 'replace',
      pattern: 'World',
      replacement: 'Universe',
    },
    mockContext,
  );

  assertEquals(result.success, true);
  assertStringIncludes(result.output, 'Hello Universe');
});

Deno.test('regex_utils - splits text', async () => {
  const result = await regexUtilsTool.execute(
    {
      text: 'one,two,three',
      operation: 'split',
      pattern: ',',
    },
    mockContext,
  );

  assertEquals(result.success, true);
  assertStringIncludes(result.output, 'one');
  assertStringIncludes(result.output, 'two');
});

Deno.test('regex_utils - handles invalid regex', async () => {
  const result = await regexUtilsTool.execute(
    {
      text: 'test',
      operation: 'match',
      pattern: '[invalid',
    },
    mockContext,
  );

  assertEquals(result.success, false);
});

// ═════════════════════════════════════════════════════════
// Env Manager Tests
// ═════════════════════════════════════════════════════════

Deno.test('env_manager - tool definition', () => {
  assertEquals(envManagerTool.definition.name, 'env_manager');
  assertStringIncludes(envManagerTool.definition.description, 'environment');
});

Deno.test('env_manager - gets environment variable', async () => {
  const result = await envManagerTool.execute(
    { operation: 'get', key: 'PATH' },
    mockContext,
  );

  assertEquals(result.success, true);
});

Deno.test('env_manager - checks if variable exists', async () => {
  const result = await envManagerTool.execute(
    { operation: 'has', key: 'PATH' },
    mockContext,
  );

  assertEquals(result.success, true);
  assertStringIncludes(result.output, 'PATH');
});

Deno.test('env_manager - lists public variables', async () => {
  const result = await envManagerTool.execute(
    { operation: 'list' },
    mockContext,
  );

  assertEquals(result.success, true);
  assertEquals(typeof result.output, 'string');
});

Deno.test('env_manager - validates whitelisted set', async () => {
  const result = await envManagerTool.execute(
    { operation: 'set', key: 'INVALID_VAR', value: 'test' },
    mockContext,
  );

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'whitelist');
});

Deno.test('env_manager - requires key for get', async () => {
  const result = await envManagerTool.execute(
    { operation: 'get' },
    mockContext,
  );

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'key');
});

// ═════════════════════════════════════════════════════════
// Code Snippet Tests
// ═════════════════════════════════════════════════════════

Deno.test('code_snippet - tool definition', () => {
  assertEquals(codeSnippetTool.definition.name, 'code_snippet');
  assertStringIncludes(codeSnippetTool.definition.description, 'code');
});

Deno.test('code_snippet - counts code blocks', async () => {
  const text = '```python\nprint("hello")\n```\n```js\nconsole.log("world")\n```';
  const result = await codeSnippetTool.execute(
    { text, operation: 'count' },
    mockContext,
  );

  assertEquals(result.success, true);
  assertStringIncludes(result.output, '2');
});

Deno.test('code_snippet - extracts code block', async () => {
  const text = '```python\nprint("hello")\n```';
  const result = await codeSnippetTool.execute(
    { text, operation: 'extract', index: 0 },
    mockContext,
  );

  assertEquals(result.success, true);
  assertStringIncludes(result.output, 'python');
  assertStringIncludes(result.output, 'print');
});

Deno.test('code_snippet - formats code with line numbers', async () => {
  const text = '```\nline 1\nline 2\nline 3\n```';
  const result = await codeSnippetTool.execute(
    { text, operation: 'format', index: 0, lineNumbers: true },
    mockContext,
  );

  assertEquals(result.success, true);
  assertStringIncludes(result.output, '1 |');
  assertStringIncludes(result.output, '2 |');
});

Deno.test('code_snippet - validates code blocks', async () => {
  const validText = '```\ncode\n```';
  const result = await codeSnippetTool.execute(
    { text: validText, operation: 'validate' },
    mockContext,
  );

  assertEquals(result.success, true);
  assertStringIncludes(result.output, 'valid');
});

Deno.test('code_snippet - handles invalid index', async () => {
  const text = '```\ncode\n```';
  const result = await codeSnippetTool.execute(
    { text, operation: 'extract', index: 5 },
    mockContext,
  );

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'Invalid index');
});

Deno.test('code_snippet - identifies multiple languages', async () => {
  const text = '```python\ncode\n```\n```javascript\ncode\n```\n```rust\ncode\n```';
  const result = await codeSnippetTool.execute(
    { text, operation: 'count' },
    mockContext,
  );

  assertEquals(result.success, true);
  assertStringIncludes(result.output, '3');
});

// ═════════════════════════════════════════════════════════
// Integration Tests
// ═════════════════════════════════════════════════════════

Deno.test('all supporting tools - return required fields', async () => {
  const tools = [
    {
      tool: jsonQueryTool,
      args: {
        json: '{"test": true}',
        path: '$.test',
        operation: 'read',
      },
    },
    {
      tool: regexUtilsTool,
      args: { text: 'test', operation: 'test', pattern: 'test' },
    },
    {
      tool: envManagerTool,
      args: { operation: 'list' },
    },
    {
      tool: codeSnippetTool,
      args: { text: '```code```', operation: 'count' },
    },
  ];

  for (const { tool, args } of tools) {
    const result = await tool.execute(args, mockContext);
    assertEquals(result.toolName, tool.definition.name);
    assertEquals(typeof result.success, 'boolean');
    assertEquals(typeof result.output, 'string');
    assertExists(result.durationMs);
  }
});
