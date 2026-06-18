import { assert, assertEquals, assertExists, assertStringIncludes } from '@std/assert';
import { imageAnalyzeTool } from '../src/tools/builtin/image_analyze.ts';
import type { ToolContext } from '../src/tools/types.ts';

const mockContext: ToolContext = {
  sessionId: 'test-session-image',
  workingDir: '/tmp',
  agentId: 'test-agent',
  workspaceDir: '/tmp/workspace',
};

Deno.test('image_analyze - tool definition', () => {
  assertEquals(imageAnalyzeTool.definition.name, 'image_analyze');
  assertStringIncludes(imageAnalyzeTool.definition.description, 'multimodal');
  assertEquals(imageAnalyzeTool.definition.capabilities, ['network:fetch']);
});

Deno.test('image_analyze - rejects empty image', async () => {
  const result = await imageAnalyzeTool.execute(
    { image: '', prompt: 'Describe this image' },
    mockContext,
  );

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'image parameter is required');
});

Deno.test('image_analyze - rejects empty prompt', async () => {
  const result = await imageAnalyzeTool.execute(
    { image: '/tmp/test.png', prompt: '' },
    mockContext,
  );

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'prompt parameter is required');
});

Deno.test('image_analyze - rejects invalid data URL', async () => {
  const result = await imageAnalyzeTool.execute(
    { image: 'data:invalid', prompt: 'Describe this' },
    mockContext,
  );

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'Invalid data URL');
});

Deno.test('image_analyze - rejects non-existent file path', async () => {
  const result = await imageAnalyzeTool.execute(
    { image: '/nonexistent/path/image.jpg', prompt: 'Describe' },
    mockContext,
  );

  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'not found');
});

Deno.test('image_analyze - returns tool name even on failure', async () => {
  const pngPixel =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const result = await imageAnalyzeTool.execute(
    { image: `data:image/png;base64,${pngPixel}`, prompt: 'What color is this?' },
    mockContext,
  );

  assertExists(result);
  assertEquals(result.toolName, 'image_analyze');
  assert(result.error !== undefined || result.success === true);
});

Deno.test('image_analyze - has detail level parameter', () => {
  const detailParam = imageAnalyzeTool.definition.params.find((p) => p.name === 'detail');
  assertExists(detailParam);
  assertEquals(detailParam?.enum, ['low', 'high', 'auto']);
});

Deno.test('image_analyze - has provider parameter', () => {
  const providerParam = imageAnalyzeTool.definition.params.find((p) => p.name === 'provider');
  assertExists(providerParam);
  assertEquals(providerParam?.required, false);
  assertEquals(providerParam?.type, 'string');
  assertExists(providerParam?.enum);
});

Deno.test('image_analyze - all required params present', () => {
  const imageParam = imageAnalyzeTool.definition.params.find((p) => p.name === 'image');
  const promptParam = imageAnalyzeTool.definition.params.find((p) => p.name === 'prompt');
  assertExists(imageParam);
  assertExists(promptParam);
  assertEquals(imageParam?.required, true);
  assertEquals(promptParam?.required, true);
});
