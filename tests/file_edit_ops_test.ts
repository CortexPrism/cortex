import { assert, assertEquals } from '@std/assert';

// Test the core edit operation logic by dynamically importing the module
// and accessing internal functions

Deno.test('file_edit tools exist and have correct definitions', async () => {
  const {
    fileWriteTool,
    fileEditTool,
    fileDeleteTool,
    fileListTool,
    fileInfoTool,
    fileSearchTool,
    fileUndoTool,
    fileRedoTool,
  } = await import('../src/tools/builtin/workspace/index.ts');

  assertEquals(fileWriteTool.definition.name, 'file_write');
  assertEquals(fileEditTool.definition.name, 'file_edit');
  assertEquals(fileDeleteTool.definition.name, 'file_delete');
  assertEquals(fileListTool.definition.name, 'file_list');
  assertEquals(fileInfoTool.definition.name, 'file_info');
  assertEquals(fileSearchTool.definition.name, 'file_search');
  assertEquals(fileUndoTool.definition.name, 'file_undo');
  assertEquals(fileRedoTool.definition.name, 'file_redo');

  assert(fileWriteTool.definition.capabilities.includes('fs:write'));
  assert(fileEditTool.definition.capabilities.includes('fs:edit'));
  assert(fileListTool.definition.capabilities.includes('fs:list'));
  assert(fileSearchTool.definition.capabilities.includes('fs:search'));
});

Deno.test('workspace tools barrel exports all tools', async () => {
  const mod = await import('../src/tools/builtin/workspace/index.ts');
  const expected = [
    'fileWriteTool',
    'fileEditTool',
    'filePatchTool',
    'fileDeleteTool',
    'fileRenameTool',
    'fileListTool',
    'fileTreeTool',
    'fileInfoTool',
    'fileSearchTool',
    'fileUndoTool',
    'fileRedoTool',
  ];
  for (const name of expected) {
    assert(name in mod, `Expected ${name} to be exported`);
  }
});
