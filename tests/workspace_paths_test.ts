import { assert, assertEquals, assertThrows } from '@std/assert';

// We need to bypass the module-level Deno calls for testing

Deno.test('getAgentWorkspaceDir returns correct path', async () => {
  const { getAgentWorkspaceDir } = await import('../src/workspace/paths.ts');
  const dir = getAgentWorkspaceDir('test-agent');
  assert(dir.includes('test-agent'), `Expected path to include agent id, got: ${dir}`);
});

Deno.test('ensureAgentWorkspace creates directory', async () => {
  const { ensureAgentWorkspace } = await import('../src/workspace/paths.ts');
  const dir = await ensureAgentWorkspace('test-agent-' + Date.now());
  try {
    await Deno.stat(dir);
    assert(true, 'Directory was created');
  } catch {
    assert(false, 'Directory was not created');
  }
  // Cleanup
  await Deno.remove(dir, { recursive: true }).catch(() => {});
});

Deno.test('resolveWorkspacePath rejects path traversal', async () => {
  const { resolveWorkspacePath } = await import('../src/workspace/paths.ts');
  const agentId = 'test-traversal-' + Date.now();

  assertThrows(
    () => resolveWorkspacePath(agentId, '/etc/passwd', 'agent'),
    Error,
    'outside the allowed workspace roots',
  );

  assertThrows(
    () => resolveWorkspacePath(agentId, '../../../etc/passwd', 'agent'),
    Error,
  );

  assertThrows(
    () => resolveWorkspacePath(agentId, '/dev/null', 'agent'),
    Error,
  );
});

Deno.test('resolveWorkspacePath allows paths within workspace', async () => {
  const { resolveWorkspacePath, getAgentWorkspaceDir } = await import('../src/workspace/paths.ts');
  const agentId = 'test-allow-' + Date.now();
  const agentDir = getAgentWorkspaceDir(agentId);

  // These should not throw
  const result = resolveWorkspacePath(agentId, 'test.txt', 'agent');
  assert(result.startsWith(agentDir), `Path should be under agent dir`);
  assert(result.endsWith('test.txt'), `Path should end with filename`);
});

Deno.test('resolveWorkspacePath with global workspace', async () => {
  const { resolveWorkspacePath } = await import('../src/workspace/paths.ts');
  const cwd = Deno.cwd();

  const result = resolveWorkspacePath('ignored', cwd + '/test.txt', 'global');
  assertEquals(result, cwd + '/test.txt');
});

Deno.test('resolveWorkspacePath with relative path resolves correctly', async () => {
  const { resolveWorkspacePath, getAgentWorkspaceDir } = await import('../src/workspace/paths.ts');
  const agentId = 'test-rel-' + Date.now();
  const agentDir = getAgentWorkspaceDir(agentId);

  const result = resolveWorkspacePath(agentId, 'relative/file.txt', 'agent');
  assert(result.startsWith(agentDir), `Path should be under agent dir`);
  assert(result.endsWith('/relative/file.txt'), `Path should end with relative/file.txt`);
});
