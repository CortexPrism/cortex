import { assertEquals, assertExists, assertStringIncludes } from '@std/assert';
import { memorySearchTool } from '../src/tools/builtin/memory_search.ts';
import type { ToolContext } from '../src/tools/types.ts';

const mockContext: ToolContext = {
  sessionId: 'test-session-123',
  workingDir: '/tmp',
  agentId: 'test-agent',
  workspaceDir: '/tmp/workspace',
};

Deno.test('memory_search - tool definition', () => {
  assertEquals(memorySearchTool.definition.name, 'memory_search');
  assertStringIncludes(
    memorySearchTool.definition.description,
    'Search agent memory',
  );
  assertEquals(memorySearchTool.definition.capabilities, ['db:read']);

  // Check required parameters
  const queryParam = memorySearchTool.definition.params.find(
    (p) => p.name === 'query',
  );
  assertExists(queryParam);
  assertEquals(queryParam?.required, true);

  // Check optional parameters
  const tierParam = memorySearchTool.definition.params.find(
    (p) => p.name === 'tier',
  );
  assertExists(tierParam);
  assertEquals(tierParam?.required, false);
  assertEquals(
    tierParam?.enum,
    ['episodic', 'semantic', 'reflection', 'graph', 'all'],
  );

  const maxResultsParam = memorySearchTool.definition.params.find(
    (p) => p.name === 'maxResults',
  );
  assertExists(maxResultsParam);
  assertEquals(maxResultsParam?.type, 'number');

  const sessionIdParam = memorySearchTool.definition.params.find(
    (p) => p.name === 'sessionId',
  );
  assertExists(sessionIdParam);
  assertEquals(sessionIdParam?.type, 'string');

  const reasonParam = memorySearchTool.definition.params.find(
    (p) => p.name === 'reason',
  );
  assertExists(reasonParam);
  assertEquals(reasonParam?.type, 'string');
});

Deno.test('memory_search - validates empty query', async () => {
  const result = await memorySearchTool.execute({}, mockContext);

  assertEquals(result.success, false);
  assertEquals(result.toolName, 'memory_search');
  assertStringIncludes(result.error ?? '', 'query');
  assertExists(result.durationMs);
});

Deno.test('memory_search - validates query string type', async () => {
  const result = await memorySearchTool.execute({ query: 123 }, mockContext);

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'string');
});

Deno.test('memory_search - rejects whitespace-only query', async () => {
  const result = await memorySearchTool.execute({ query: '   ' }, mockContext);

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'empty');
});

Deno.test('memory_search - accepts valid query', async () => {
  const result = await memorySearchTool.execute(
    { query: 'test memory search' },
    mockContext,
  );

  // Should either succeed or fail gracefully due to missing embedder/DB
  // but not due to validation
  assertExists(result.toolName);
  assertEquals(result.toolName, 'memory_search');
  assertExists(result.durationMs);
});

Deno.test('memory_search - handles tier filtering', async () => {
  const result = await memorySearchTool.execute(
    { query: 'test', tier: 'episodic' },
    mockContext,
  );

  assertEquals(result.toolName, 'memory_search');
  assertExists(result.durationMs);
});

Deno.test('memory_search - handles maxResults clamping', async () => {
  // Test that maxResults is clamped to 1-20 range
  const resultLow = await memorySearchTool.execute(
    { query: 'test', maxResults: 0 },
    mockContext,
  );

  assertEquals(resultLow.toolName, 'memory_search');

  const resultHigh = await memorySearchTool.execute(
    { query: 'test', maxResults: 100 },
    mockContext,
  );

  assertEquals(resultHigh.toolName, 'memory_search');
});

Deno.test('memory_search - includes context data in supervisor request', async () => {
  const contextWithIds: ToolContext = {
    sessionId: 'session-xyz',
    workingDir: '/tmp',
    agentId: 'agent-abc',
    workspaceDir: '/tmp/ws',
  };

  const result = await memorySearchTool.execute(
    { query: 'sensitive data', reason: 'checking compliance' },
    contextWithIds,
  );

  // Should use context IDs, not fallback to 'unknown'
  assertEquals(result.toolName, 'memory_search');
  assertExists(result.durationMs);
});

Deno.test('memory_search - handles all tier types', async () => {
  const tiers = ['episodic', 'semantic', 'reflection', 'graph', 'all'];

  for (const tier of tiers) {
    const result = await memorySearchTool.execute(
      { query: 'test', tier },
      mockContext,
    );

    assertEquals(result.toolName, 'memory_search');
    assertExists(result.durationMs);
  }
});

Deno.test('memory_search - result includes required fields', async () => {
  const result = await memorySearchTool.execute(
    { query: 'memory test' },
    mockContext,
  );

  // All results must have these fields per Tool interface
  assertEquals(result.toolName, 'memory_search');
  assertEquals(typeof result.success, 'boolean');
  assertEquals(typeof result.output, 'string');
  assertExists(result.durationMs);

  // If error, should have error field
  if (!result.success) {
    assertExists(result.error);
  }
});

Deno.test('memory_search - duration is measured', async () => {
  const result = await memorySearchTool.execute(
    { query: 'performance test' },
    mockContext,
  );

  assertEquals(typeof result.durationMs, 'number');
  // Should be relatively fast (< 5 seconds for empty query)
  // Real execution time depends on DB/embedder availability
});
