import { assertEquals, assertExists, assertStringIncludes } from '@std/assert';
import { structuredExtractTool } from '../src/tools/builtin/structured_extract.ts';
import type { ToolContext } from '../src/tools/types.ts';

const mockContext: ToolContext = {
  sessionId: 'test-session-extract',
  workingDir: '/tmp',
  agentId: 'test-agent',
  workspaceDir: '/tmp/workspace',
};

Deno.test('structured_extract - tool definition', () => {
  assertEquals(structuredExtractTool.definition.name, 'structured_extract');
  assertStringIncludes(
    structuredExtractTool.definition.description,
    'extraction',
  );
  assertEquals(
    structuredExtractTool.definition.capabilities,
    ['network:fetch'],
  );

  // Check required parameters
  const inputParam = structuredExtractTool.definition.params.find(
    (p) => p.name === 'input',
  );
  assertExists(inputParam);
  assertEquals(inputParam?.required, true);

  const descriptionParam = structuredExtractTool.definition.params.find(
    (p) => p.name === 'description',
  );
  assertExists(descriptionParam);
  assertEquals(descriptionParam?.required, true);

  // Check optional parameters
  const formatParam = structuredExtractTool.definition.params.find(
    (p) => p.name === 'format',
  );
  assertExists(formatParam);
  assertEquals(formatParam?.required, false);
  assertEquals(formatParam?.enum, ['text', 'html', 'json']);
});

Deno.test('structured_extract - validates input is required', async () => {
  const result = await structuredExtractTool.execute(
    { description: 'Extract emails' },
    mockContext,
  );

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'input');
});

Deno.test('structured_extract - validates description is required', async () => {
  const result = await structuredExtractTool.execute(
    { input: 'test data' },
    mockContext,
  );

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'description');
});

Deno.test('structured_extract - extracts emails', async () => {
  const result = await structuredExtractTool.execute(
    {
      input: 'Contact us at support@example.com or sales@company.org',
      description: 'Extract all email addresses',
    },
    mockContext,
  );

  assertEquals(result.toolName, 'structured_extract');
  assertEquals(result.success, true);
  assertStringIncludes(result.output, 'support@example.com');
});

Deno.test('structured_extract - extracts phone numbers', async () => {
  const result = await structuredExtractTool.execute(
    {
      input: 'Call us at 555-123-4567 or (555) 987-6543',
      description: 'Extract phone numbers',
    },
    mockContext,
  );

  assertEquals(result.success, true);
  assertEquals(typeof result.output, 'string');
  assertExists(result.durationMs);
});

Deno.test('structured_extract - extracts URLs', async () => {
  const result = await structuredExtractTool.execute(
    {
      input: 'Visit https://example.com or https://docs.example.com/api for more info',
      description: 'Extract URLs',
    },
    mockContext,
  );

  assertEquals(result.success, true);
  assertStringIncludes(result.output, 'https://example.com');
});

Deno.test('structured_extract - accepts text format', async () => {
  const result = await structuredExtractTool.execute(
    {
      input: 'Plain text content here',
      format: 'text',
      description: 'Extract data',
    },
    mockContext,
  );

  assertEquals(result.toolName, 'structured_extract');
});

Deno.test('structured_extract - accepts html format', async () => {
  const result = await structuredExtractTool.execute(
    {
      input: '<p>Hello <b>world</b></p>',
      format: 'html',
      description: 'Extract text content',
    },
    mockContext,
  );

  assertEquals(result.toolName, 'structured_extract');
});

Deno.test('structured_extract - accepts json format', async () => {
  const result = await structuredExtractTool.execute(
    {
      input: '{"name": "John", "email": "john@example.com"}',
      format: 'json',
      description: 'Extract user data',
    },
    mockContext,
  );

  assertEquals(result.toolName, 'structured_extract');
});

Deno.test('structured_extract - accepts schema parameter', async () => {
  const schema = {
    type: 'object',
    properties: {
      emails: { type: 'array' },
    },
    required: ['emails'],
  };

  const result = await structuredExtractTool.execute(
    {
      input: 'Email: test@example.com',
      description: 'Extract emails',
      schema,
    },
    mockContext,
  );

  assertEquals(result.toolName, 'structured_extract');
});

Deno.test('structured_extract - accepts strict mode', async () => {
  const schema = {
    type: 'object',
    properties: {
      emails: { type: 'array' },
    },
    required: ['emails'],
  };

  const result = await structuredExtractTool.execute(
    {
      input: 'test data',
      description: 'Extract emails',
      schema,
      strict: true,
    },
    mockContext,
  );

  assertEquals(result.toolName, 'structured_extract');
  assertExists(result.durationMs);
});

Deno.test('structured_extract - accepts streaming mode', async () => {
  const result = await structuredExtractTool.execute(
    {
      input: 'Multiple items to process',
      description: 'Extract items',
      streaming: true,
    },
    mockContext,
  );

  assertEquals(result.toolName, 'structured_extract');
});

Deno.test('structured_extract - handles empty input gracefully', async () => {
  const result = await structuredExtractTool.execute(
    {
      input: '   ',
      description: 'Extract data',
    },
    mockContext,
  );

  assertEquals(result.success, false);
});

Deno.test('structured_extract - result includes required fields', async () => {
  const result = await structuredExtractTool.execute(
    {
      input: 'Sample data',
      description: 'Process this',
    },
    mockContext,
  );

  assertEquals(result.toolName, 'structured_extract');
  assertEquals(typeof result.success, 'boolean');
  assertEquals(typeof result.output, 'string');
  assertExists(result.durationMs);

  if (!result.success) {
    assertExists(result.error);
  }
});

Deno.test('structured_extract - duration is measured', async () => {
  const result = await structuredExtractTool.execute(
    {
      input: 'test content',
      description: 'extract pattern',
    },
    mockContext,
  );

  assertEquals(typeof result.durationMs, 'number');
  assertEquals(result.durationMs >= 0, true);
});

Deno.test('structured_extract - handles large input', async () => {
  const largeInput = 'Test data. '.repeat(500); // Large input

  const result = await structuredExtractTool.execute(
    {
      input: largeInput,
      description: 'Extract patterns',
    },
    mockContext,
  );

  assertEquals(result.toolName, 'structured_extract');
  // Should truncate gracefully
  assertStringIncludes(result.output, 'extracted');
});

Deno.test('structured_extract - validates json format input', async () => {
  const jsonInput = JSON.stringify({
    users: [
      { name: 'Alice', email: 'alice@example.com' },
      { name: 'Bob', email: 'bob@example.com' },
    ],
  });

  const result = await structuredExtractTool.execute(
    {
      input: jsonInput,
      format: 'json',
      description: 'Extract user emails',
    },
    mockContext,
  );

  assertEquals(result.success, true);
});

Deno.test('structured_extract - handles invalid json gracefully', async () => {
  const result = await structuredExtractTool.execute(
    {
      input: '{ invalid json ]',
      format: 'json',
      description: 'Extract data',
    },
    mockContext,
  );

  assertEquals(result.toolName, 'structured_extract');
  assertExists(result.durationMs);
});

Deno.test('structured_extract - strips HTML tags', async () => {
  const htmlInput = '<div><p>Contact: test@example.com</p></div>';

  const result = await structuredExtractTool.execute(
    {
      input: htmlInput,
      format: 'html',
      description: 'Extract email from HTML',
    },
    mockContext,
  );

  assertEquals(result.success, true);
  assertStringIncludes(result.output.toLowerCase(), 'email');
});

Deno.test('structured_extract - case-insensitive description matching', async () => {
  const result = await structuredExtractTool.execute(
    {
      input: 'Call 555-123-4567',
      description: 'EXTRACT PHONE NUMBERS',
    },
    mockContext,
  );

  assertEquals(result.success, true);
  assertStringIncludes(result.output, 'phones');
});
