import { assertEquals, assertExists, assertStringIncludes } from '@std/assert';
import { fileDiffTool } from '../src/tools/builtin/workspace/file_diff.ts';
import { ensureAgentWorkspace, getAgentWorkspaceDir } from '../src/workspace/paths.ts';
import type { ToolContext } from '../src/tools/types.ts';

const AGENT_ID = 'test-agent-diff';
const mockContext: ToolContext = {
  sessionId: 'test-session-diff',
  workingDir: '/tmp',
  agentId: AGENT_ID,
  workspaceDir: '/tmp',
};

async function setupFiles(
  content1: string,
  content2: string,
): Promise<{ path1: string; path2: string }> {
  await ensureAgentWorkspace(AGENT_ID);
  const wsDir = getAgentWorkspaceDir(AGENT_ID);
  const path1 = `${wsDir}/file1.txt`;
  const path2 = `${wsDir}/file2.txt`;
  await Deno.writeTextFile(path1, content1);
  await Deno.writeTextFile(path2, content2);
  return { path1, path2 };
}

Deno.test('file_diff_enhanced - has format parameter', () => {
  const formatParam = fileDiffTool.definition.params.find((p) => p.name === 'format');
  assertExists(formatParam);
  assertEquals(formatParam?.enum, ['default', 'unified', 'side_by_side', 'minimal']);
});

Deno.test('file_diff_enhanced - has syntax_hint parameter', () => {
  const syntaxHintParam = fileDiffTool.definition.params.find((p) => p.name === 'syntax_hint');
  assertExists(syntaxHintParam);
  assertEquals(syntaxHintParam?.type, 'string');
  assertEquals(syntaxHintParam?.required, false);
});

Deno.test('file_diff_enhanced - default format with identical files', async () => {
  const { path1, path2 } = await setupFiles('hello\nworld\n', 'hello\nworld\n');

  const result = await fileDiffTool.execute(
    { path1, path2, workspace: 'agent' },
    mockContext,
  );

  assertEquals(result.success, true, result.error ?? 'unknown error');
  assertStringIncludes(result.output, 'identical');
});

Deno.test('file_diff_enhanced - unified format produces @@ headers', async () => {
  const { path1, path2 } = await setupFiles(
    'line1\nline2\nline3\n',
    'line1\nline2_modified\nline3\n',
  );

  const result = await fileDiffTool.execute(
    { path1, path2, workspace: 'agent', format: 'unified' },
    mockContext,
  );

  assertEquals(result.success, true, result.error ?? 'unknown error');
  assertStringIncludes(result.output, '---');
  assertStringIncludes(result.output, '+++');
  assertStringIncludes(result.output, '@@');
});

Deno.test('file_diff_enhanced - side_by_side format', async () => {
  const { path1, path2 } = await setupFiles(
    'old line\n',
    'new line\n',
  );

  const result = await fileDiffTool.execute(
    { path1, path2, workspace: 'agent', format: 'side_by_side' },
    mockContext,
  );

  assertEquals(result.success, true, result.error ?? 'unknown error');
  assertStringIncludes(result.output, 'File 1');
  assertStringIncludes(result.output, 'File 2');
});

Deno.test('file_diff_enhanced - minimal format shows only changes', async () => {
  const { path1, path2 } = await setupFiles(
    'unchanged\nold line\nunchanged2\n',
    'unchanged\nnew line\nunchanged2\n',
  );

  const result = await fileDiffTool.execute(
    { path1, path2, workspace: 'agent', format: 'minimal' },
    mockContext,
  );

  assertEquals(result.success, true, result.error ?? 'unknown error');
  assertStringIncludes(result.output, '+');
  assertStringIncludes(result.output, '-');
});

Deno.test('file_diff_enhanced - syntax_hint sets code block language', async () => {
  const { path1, path2 } = await setupFiles(
    'const x = 1;\n',
    'const x = 2;\n',
  );

  const result = await fileDiffTool.execute(
    {
      path1,
      path2,
      workspace: 'agent',
      format: 'default',
      syntax_hint: 'typescript',
    },
    mockContext,
  );

  assertEquals(result.success, true, result.error ?? 'unknown error');
  assertStringIncludes(result.output, '```typescript');
});

Deno.test('file_diff_enhanced - unified format with syntax_hint uses language fence', async () => {
  const { path1, path2 } = await setupFiles(
    'a\n',
    'b\n',
  );

  const result = await fileDiffTool.execute(
    {
      path1,
      path2,
      workspace: 'agent',
      format: 'unified',
      syntax_hint: 'python',
    },
    mockContext,
  );

  assertEquals(result.success, true, result.error ?? 'unknown error');
  assertStringIncludes(result.output, '```python');
});

Deno.test('file_diff_enhanced - missing file returns error', async () => {
  const wsDir = getAgentWorkspaceDir(AGENT_ID);
  const result = await fileDiffTool.execute(
    {
      path1: `${wsDir}/nonexistent-a.txt`,
      path2: `${wsDir}/nonexistent-b.txt`,
      workspace: 'agent',
    },
    mockContext,
  );

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'Cannot read');
});

Deno.test('file_diff_enhanced - unified format with additions', async () => {
  const { path1, path2 } = await setupFiles(
    'line1\n',
    'line1\nline2\nline3\n',
  );

  const result = await fileDiffTool.execute(
    { path1, path2, workspace: 'agent', format: 'unified' },
    mockContext,
  );

  assertEquals(result.success, true, result.error ?? 'unknown error');
  assertStringIncludes(result.output, '+line2');
  assertStringIncludes(result.output, '+line3');
});

Deno.test('file_diff_enhanced - unified format with deletions', async () => {
  const { path1, path2 } = await setupFiles(
    'line1\nline2\nline3\n',
    'line1\n',
  );

  const result = await fileDiffTool.execute(
    { path1, path2, workspace: 'agent', format: 'unified' },
    mockContext,
  );

  assertEquals(result.success, true, result.error ?? 'unknown error');
  assertStringIncludes(result.output, '-line2');
  assertStringIncludes(result.output, '-line3');
});

Deno.test('file_diff_enhanced - context_lines parameter works', async () => {
  const { path1, path2 } = await setupFiles(
    'a\nb\nc\nd\ne\nf\ng\nh\ni\nj\n',
    'a\nb\nc\nCHANGED\nd\ne\nf\ng\nh\ni\nj\n',
  );

  const result = await fileDiffTool.execute(
    { path1, path2, workspace: 'agent', context_lines: 1 },
    mockContext,
  );

  assertEquals(result.success, true, result.error ?? 'unknown error');
});

Deno.test('file_diff_enhanced - existing definition unchanged for backward compatibility', () => {
  assertEquals(fileDiffTool.definition.capabilities, ['fs:read']);

  const path1Param = fileDiffTool.definition.params.find((p) => p.name === 'path1');
  const path2Param = fileDiffTool.definition.params.find((p) => p.name === 'path2');
  assertExists(path1Param);
  assertExists(path2Param);
  assertEquals(path1Param?.required, true);
  assertEquals(path2Param?.required, true);
});
