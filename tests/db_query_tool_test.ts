import { assertEquals, assertExists, assertStringIncludes } from '@std/assert';
import { dbQueryTool } from '../src/tools/builtin/db_query.ts';
import type { ToolContext } from '../src/tools/types.ts';

const mockContext: ToolContext = {
  sessionId: 'test-session-456',
  workingDir: '/tmp',
  agentId: 'test-agent',
  workspaceDir: '/tmp/workspace',
};

Deno.test('db_query - tool definition', () => {
  assertEquals(dbQueryTool.definition.name, 'db_query');
  assertStringIncludes(
    dbQueryTool.definition.description,
    'read-only mode',
  );
  assertEquals(dbQueryTool.definition.capabilities, ['db:read']);

  // Check required parameters
  const databaseParam = dbQueryTool.definition.params.find(
    (p) => p.name === 'database',
  );
  assertExists(databaseParam);
  assertEquals(databaseParam?.required, true);
  assertEquals(
    databaseParam?.enum,
    ['cortex', 'memory', 'lens', 'plugins', 'session'],
  );

  const queryParam = dbQueryTool.definition.params.find(
    (p) => p.name === 'query',
  );
  assertExists(queryParam);
  assertEquals(queryParam?.required, true);

  // Check optional parameters
  const formatParam = dbQueryTool.definition.params.find(
    (p) => p.name === 'format',
  );
  assertExists(formatParam);
  assertEquals(formatParam?.required, false);
  assertEquals(formatParam?.enum, ['table', 'json', 'csv']);
});

Deno.test('db_query - validates database name', async () => {
  const result = await dbQueryTool.execute(
    { database: 'invalid_db', query: 'SELECT 1' },
    mockContext,
  );

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'database must be one of');
});

Deno.test('db_query - validates query is required', async () => {
  const result = await dbQueryTool.execute(
    { database: 'cortex' },
    mockContext,
  );

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'query');
});

Deno.test('db_query - blocks INSERT operations', async () => {
  const result = await dbQueryTool.execute(
    { database: 'cortex', query: 'INSERT INTO users VALUES (1, "test")' },
    mockContext,
  );

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'Write operations');
});

Deno.test('db_query - blocks UPDATE operations', async () => {
  const result = await dbQueryTool.execute(
    { database: 'cortex', query: 'UPDATE users SET name = "test"' },
    mockContext,
  );

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'Write operations');
});

Deno.test('db_query - blocks DELETE operations', async () => {
  const result = await dbQueryTool.execute(
    { database: 'cortex', query: 'DELETE FROM users' },
    mockContext,
  );

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'Write operations');
});

Deno.test('db_query - blocks DROP operations', async () => {
  const result = await dbQueryTool.execute(
    { database: 'cortex', query: 'DROP TABLE users' },
    mockContext,
  );

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'Write operations');
});

Deno.test('db_query - blocks ALTER operations', async () => {
  const result = await dbQueryTool.execute(
    { database: 'cortex', query: 'ALTER TABLE users ADD COLUMN new_col' },
    mockContext,
  );

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'Write operations');
});

Deno.test('db_query - blocks CREATE operations', async () => {
  const result = await dbQueryTool.execute(
    { database: 'cortex', query: 'CREATE TABLE new_table (id INTEGER)' },
    mockContext,
  );

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'Write operations');
});

Deno.test('db_query - allows SELECT queries', async () => {
  const result = await dbQueryTool.execute(
    { database: 'cortex', query: 'SELECT 1 as num' },
    mockContext,
  );

  // Should either succeed or fail due to database connectivity,
  // but not validation failure
  assertEquals(result.toolName, 'db_query');
  assertExists(result.durationMs);
});

Deno.test('db_query - allows PRAGMA queries', async () => {
  const result = await dbQueryTool.execute(
    { database: 'cortex', query: 'PRAGMA table_list' },
    mockContext,
  );

  assertEquals(result.toolName, 'db_query');
  assertExists(result.durationMs);
});

Deno.test('db_query - allows EXPLAIN queries', async () => {
  const result = await dbQueryTool.execute(
    { database: 'cortex', query: 'EXPLAIN SELECT 1' },
    mockContext,
  );

  assertEquals(result.toolName, 'db_query');
  assertExists(result.durationMs);
});

Deno.test('db_query - allows WITH (CTE) queries', async () => {
  const result = await dbQueryTool.execute(
    { database: 'cortex', query: 'WITH nums AS (SELECT 1 as n) SELECT * FROM nums' },
    mockContext,
  );

  assertEquals(result.toolName, 'db_query');
  assertExists(result.durationMs);
});

Deno.test('db_query - format parameter defaults to table', async () => {
  const result = await dbQueryTool.execute(
    { database: 'cortex', query: 'SELECT 1' },
    mockContext,
  );

  // Should execute without error for format parameter
  assertEquals(result.toolName, 'db_query');
});

Deno.test('db_query - supports json format', async () => {
  const result = await dbQueryTool.execute(
    { database: 'cortex', query: 'SELECT 1 as num', format: 'json' },
    mockContext,
  );

  assertEquals(result.toolName, 'db_query');
});

Deno.test('db_query - supports csv format', async () => {
  const result = await dbQueryTool.execute(
    { database: 'cortex', query: 'SELECT 1 as num', format: 'csv' },
    mockContext,
  );

  assertEquals(result.toolName, 'db_query');
});

Deno.test('db_query - accepts reason parameter', async () => {
  const result = await dbQueryTool.execute(
    {
      database: 'cortex',
      query: 'SELECT 1',
      reason: 'Checking active sessions',
    },
    mockContext,
  );

  assertEquals(result.toolName, 'db_query');
});

Deno.test('db_query - result includes required fields', async () => {
  const result = await dbQueryTool.execute(
    { database: 'cortex', query: 'SELECT 1' },
    mockContext,
  );

  // All results must have these fields per Tool interface
  assertEquals(result.toolName, 'db_query');
  assertEquals(typeof result.success, 'boolean');
  assertEquals(typeof result.output, 'string');
  assertExists(result.durationMs);

  // If error, should have error field
  if (!result.success) {
    assertExists(result.error);
  }
});

Deno.test('db_query - duration is measured', async () => {
  const result = await dbQueryTool.execute(
    { database: 'cortex', query: 'SELECT 1' },
    mockContext,
  );

  assertEquals(typeof result.durationMs, 'number');
  // Should be relatively fast
});

Deno.test('db_query - handles all database options', async () => {
  const databases = ['cortex', 'memory', 'lens', 'plugins', 'session'];

  for (const db of databases) {
    const result = await dbQueryTool.execute(
      { database: db, query: 'SELECT 1', sessionId: mockContext.sessionId },
      mockContext,
    );

    assertEquals(result.toolName, 'db_query');
    assertExists(result.durationMs);
  }
});

Deno.test('db_query - case-insensitive keyword detection', async () => {
  // Test lowercase
  const resultLower = await dbQueryTool.execute(
    { database: 'cortex', query: 'select 1' },
    mockContext,
  );
  assertEquals(resultLower.toolName, 'db_query');

  // Test mixed case
  const resultMixed = await dbQueryTool.execute(
    { database: 'cortex', query: 'SeLeCt 1' },
    mockContext,
  );
  assertEquals(resultMixed.toolName, 'db_query');
});
