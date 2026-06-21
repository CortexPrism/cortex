import { assertEquals, assertExists, assertStringIncludes } from '@std/assert';
import { scheduleTool } from '../src/tools/builtin/schedule.ts';
import type { ToolContext } from '../src/tools/types.ts';
import { runMigrations } from '../src/db/migrate.ts';

const mockContext: ToolContext = {
  sessionId: 'test-session-schedule',
  workingDir: '/tmp',
  agentId: 'test-agent',
  workspaceDir: '/tmp/workspace',
};

let migrated = false;

async function ensureMigrations() {
  if (!migrated) {
    await runMigrations();
    migrated = true;
  }
}

Deno.test('schedule - tool definition', () => {
  assertEquals(scheduleTool.definition.name, 'schedule');
  assertStringIncludes(scheduleTool.definition.description, 'cron');
  assertEquals(scheduleTool.definition.capabilities, ['db:read']);
});

Deno.test('schedule - action parameter has correct options', () => {
  const actionParam = scheduleTool.definition.params.find((p) => p.name === 'action');
  assertExists(actionParam);
  assertEquals(actionParam?.required, true);
  assertEquals(actionParam?.enum, ['create', 'list', 'cancel', 'status', 'due']);
});

Deno.test('schedule - rejects invalid action', async () => {
  const result = await scheduleTool.execute({ action: 'invalid_action' }, mockContext);

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'action must be one of');
});

Deno.test('schedule - list returns jobs successfully', async () => {
  await ensureMigrations();
  const result = await scheduleTool.execute({ action: 'list' }, mockContext);

  assertEquals(result.success, true);
  assertStringIncludes(result.output, 'Scheduled Jobs');
});

Deno.test('schedule - due succeeds', async () => {
  await ensureMigrations();
  const result = await scheduleTool.execute({ action: 'due' }, mockContext);

  assertEquals(result.success, true);
  assertStringIncludes(result.output.toLowerCase(), 'jobs');
});

Deno.test('schedule - create requires name', async () => {
  const result = await scheduleTool.execute(
    { action: 'create', command: 'echo hello' },
    mockContext,
  );

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'name parameter is required');
});

Deno.test('schedule - create requires command', async () => {
  const result = await scheduleTool.execute(
    { action: 'create', name: 'test-job' },
    mockContext,
  );

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'command parameter is required');
});

Deno.test('schedule - create with cron requires cron expression', async () => {
  const result = await scheduleTool.execute(
    { action: 'create', name: 'test-job', command: 'echo hello', kind: 'cron' },
    mockContext,
  );

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'cron parameter is required');
});

Deno.test('schedule - create rejects invalid cron expression', async () => {
  const result = await scheduleTool.execute(
    {
      action: 'create',
      name: 'test-job',
      command: 'echo hello',
      kind: 'cron',
      cron: 'invalid cron',
    },
    mockContext,
  );

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'Invalid cron expression');
});

Deno.test('schedule - cancel requires job_id', async () => {
  const result = await scheduleTool.execute({ action: 'cancel' }, mockContext);

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'job_id parameter is required');
});

Deno.test('schedule - status requires job_id', async () => {
  const result = await scheduleTool.execute({ action: 'status' }, mockContext);

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'job_id parameter is required');
});

Deno.test('schedule - status for non-existent job returns error', async () => {
  await ensureMigrations();
  const result = await scheduleTool.execute(
    { action: 'status', job_id: 'nonexistent-job-id' },
    mockContext,
  );

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'Job not found');
});

Deno.test('schedule - has kind parameter with options', () => {
  const kindParam = scheduleTool.definition.params.find((p) => p.name === 'kind');
  assertExists(kindParam);
  assertEquals(kindParam?.enum, ['once', 'cron', 'interval']);
});

Deno.test('schedule - has max_attempts parameter', () => {
  const maxAttemptsParam = scheduleTool.definition.params.find((p) => p.name === 'max_attempts');
  assertExists(maxAttemptsParam);
  assertEquals(maxAttemptsParam?.type, 'number');
});

Deno.test('schedule - creates job with valid cron expression', async () => {
  await ensureMigrations();
  const result = await scheduleTool.execute(
    {
      action: 'create',
      name: 'daily-backup',
      command: 'tar -czf backup.tar.gz /data',
      kind: 'cron',
      cron: '0 2 * * *',
    },
    mockContext,
  );

  assertEquals(result.success, true);
  assertStringIncludes(result.output, 'Job Created');
  assertStringIncludes(result.output, 'daily-backup');
  assertStringIncludes(result.output, 'tar -czf');
});

Deno.test('schedule - creates job with default kind', async () => {
  await ensureMigrations();
  const result = await scheduleTool.execute(
    {
      action: 'create',
      name: 'quick-task',
      command: 'echo done',
      cron: '*/5 * * * *',
    },
    mockContext,
  );

  assertEquals(result.success, true);
  assertStringIncludes(result.output, 'Job Created');
  assertStringIncludes(result.output, 'quick-task');
});
