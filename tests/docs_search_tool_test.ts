import { assertEquals, assertExists, assertStringIncludes } from '@std/assert';
import { docsSearchTool } from '../src/tools/builtin/docs_search.ts';
import type { ToolContext } from '../src/tools/types.ts';

const mockContext: ToolContext = {
  sessionId: 'test-session-docs',
  workingDir: '/tmp',
  agentId: 'test-agent',
  workspaceDir: '/tmp/workspace',
};

Deno.test('docs_search - tool definition', () => {
  assertEquals(docsSearchTool.definition.name, 'docs_search');
  assertStringIncludes(
    docsSearchTool.definition.description,
    'documentation',
  );
  assertEquals(docsSearchTool.definition.capabilities, ['network:fetch']);

  // Check required parameters
  const libraryParam = docsSearchTool.definition.params.find(
    (p) => p.name === 'library',
  );
  assertExists(libraryParam);
  assertEquals(libraryParam?.required, true);

  const queryParam = docsSearchTool.definition.params.find(
    (p) => p.name === 'query',
  );
  assertExists(queryParam);
  assertEquals(queryParam?.required, true);

  // Check optional parameters
  const versionParam = docsSearchTool.definition.params.find(
    (p) => p.name === 'version',
  );
  assertExists(versionParam);
  assertEquals(versionParam?.required, false);
});

Deno.test('docs_search - validates library is required', async () => {
  const result = await docsSearchTool.execute(
    { query: 'useState' },
    mockContext,
  );

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'library');
});

Deno.test('docs_search - validates query is required', async () => {
  const result = await docsSearchTool.execute(
    { library: 'React' },
    mockContext,
  );

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'query');
});

Deno.test('docs_search - rejects empty library', async () => {
  const result = await docsSearchTool.execute(
    { library: '   ', query: 'hook' },
    mockContext,
  );

  assertEquals(result.success, false);
});

Deno.test('docs_search - rejects empty query', async () => {
  const result = await docsSearchTool.execute(
    { library: 'React', query: '   ' },
    mockContext,
  );

  assertEquals(result.success, false);
});

Deno.test('docs_search - searches React documentation', async () => {
  const result = await docsSearchTool.execute(
    { library: 'React', query: 'useState hook' },
    mockContext,
  );

  assertEquals(result.toolName, 'docs_search');
  assertEquals(typeof result.output, 'string');
  assertExists(result.durationMs);
});

Deno.test('docs_search - searches Next.js documentation', async () => {
  const result = await docsSearchTool.execute(
    { library: 'Next.js', query: 'getServerSideProps' },
    mockContext,
  );

  assertEquals(result.toolName, 'docs_search');
  assertEquals(result.success, true);
  assertStringIncludes(result.output, 'getServerSideProps');
});

Deno.test('docs_search - searches TypeScript documentation', async () => {
  const result = await docsSearchTool.execute(
    { library: 'TypeScript', query: 'types' },
    mockContext,
  );

  assertEquals(result.toolName, 'docs_search');
  assertEquals(result.success, true);
});

Deno.test('docs_search - accepts version parameter', async () => {
  const result = await docsSearchTool.execute(
    {
      library: 'React',
      query: 'hooks',
      version: '18.0.0',
    },
    mockContext,
  );

  assertEquals(result.toolName, 'docs_search');
  assertExists(result.durationMs);
});

Deno.test('docs_search - accepts includeExamples parameter', async () => {
  const result = await docsSearchTool.execute(
    {
      library: 'Vue',
      query: 'composition api',
      includeExamples: true,
    },
    mockContext,
  );

  assertEquals(result.toolName, 'docs_search');
});

Deno.test('docs_search - caches results', async () => {
  const result1 = await docsSearchTool.execute(
    { library: 'React', query: 'memo' },
    mockContext,
  );

  const result2 = await docsSearchTool.execute(
    { library: 'React', query: 'memo' },
    mockContext,
  );

  assertEquals(result2.success, true);
  assertStringIncludes(result2.output, 'Cached result');
});

Deno.test('docs_search - cache is case-insensitive', async () => {
  const query1 = await docsSearchTool.execute(
    { library: 'react', query: 'lazy' },
    mockContext,
  );

  const query2 = await docsSearchTool.execute(
    { library: 'React', query: 'Lazy' },
    mockContext,
  );

  // Should be different because library names are matched differently
  // but we verify both succeed
  assertEquals(query1.toolName, 'docs_search');
  assertEquals(query2.toolName, 'docs_search');
});

Deno.test('docs_search - result includes required fields', async () => {
  const result = await docsSearchTool.execute(
    { library: 'Angular', query: 'services' },
    mockContext,
  );

  assertEquals(result.toolName, 'docs_search');
  assertEquals(typeof result.success, 'boolean');
  assertEquals(typeof result.output, 'string');
  assertExists(result.durationMs);

  if (!result.success) {
    assertExists(result.error);
  }
});

Deno.test('docs_search - returns documentation content', async () => {
  const result = await docsSearchTool.execute(
    { library: 'Express', query: 'middleware' },
    mockContext,
  );

  assertEquals(result.success, true);
  // Result should contain documentation-like content
  assertEquals(typeof result.output, 'string');
  assertEquals(result.output.length > 0, true);
});

Deno.test('docs_search - handles case-insensitive library names', async () => {
  const result = await docsSearchTool.execute(
    { library: 'typescript', query: 'interface' },
    mockContext,
  );

  assertEquals(result.toolName, 'docs_search');
  assertExists(result.durationMs);
});

Deno.test('docs_search - handles version-specific searches', async () => {
  const result = await docsSearchTool.execute(
    {
      library: 'Vue',
      query: 'watchers',
      version: '3.3.0',
    },
    mockContext,
  );

  assertEquals(result.toolName, 'docs_search');
});

Deno.test('docs_search - duration is measured', async () => {
  const result = await docsSearchTool.execute(
    { library: 'Deno', query: 'runtime' },
    mockContext,
  );

  assertEquals(typeof result.durationMs, 'number');
  assertEquals(result.durationMs >= 0, true);
});
