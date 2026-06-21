import { assert, assertEquals, assertGreater } from '@std/assert';
import { parseToolCalls } from '../src/tools/executor.ts';

Deno.test('parseToolCalls - large JSON inside tool_call block', async (t) => {
  await t.step('finds file_write in JSON tool_call block', () => {
    const response =
      `<tool_call>\n{"tool": "file_write", "args": {"path": "PLAN.md", "content": "simple content"}}\n</tool_call>`;
    const calls = parseToolCalls(response);
    assertGreater(calls.length, 0);
    assertEquals(calls[0].toolName, 'file_write');
  });

  await t.step('handles raw newlines in JSON content strings', () => {
    const responseWithNewlines = `<tool_call>
{"tool": "file_write", "args": {"path": "plan.md", "content": "# Plan
## Section 1
Content here."}}
</tool_call>`;
    const calls = parseToolCalls(responseWithNewlines);
    assertGreater(calls.length, 0, 'should find tool call with raw newlines in content');
    assertEquals(calls[0].toolName, 'file_write');
  });

  await t.step('handles very large content strings', () => {
    let longContent = '# Plan\n\n';
    for (let i = 0; i < 500; i++) longContent += `## Section ${i}\n\nContent.\n\n`;
    const bigResponse =
      `<tool_call>\n{"tool": "file_write", "args": {"path": "PLAN.md", "content": ${
        JSON.stringify(longContent)
      }}}\n</tool_call>`;
    assertGreater(parseToolCalls(bigResponse).length, 0);
  });

  await t.step('handles unescaped double quotes in content string', () => {
    const responseWithQuotes = `<tool_call>
{"tool": "file_write", "args": {"path": "costs.md", "content": "# Analysis

The "best" option is AWS.

Consider the trade-offs: "latency" vs "cost".
"GKE" is recommended for most cases."}}
</tool_call>`;
    const calls = parseToolCalls(responseWithQuotes);
    assertGreater(calls.length, 0, 'should parse tool call with unescaped quotes in content');
    assertEquals(calls[0].toolName, 'file_write');
  });
});

Deno.test('parseToolCalls - direct tool-name-as-tag format', async (t) => {
  await t.step('parses file_read_enhanced with child param tags', () => {
    const response =
      `<file_read_enhanced><path>BUSINESS-PLAN.pdf</path><offset>150</offset><limit>200</limit></file_read_enhanced>`;
    const calls = parseToolCalls(response);
    assertGreater(calls.length, 0);
    assertEquals(calls[0].toolName, 'file_read_enhanced');
    assertEquals(calls[0].args.offset, 150);
  });

  await t.step('parses multiple direct tool tags', () => {
    const response =
      `<file_read_enhanced><path>a.md</path></file_read_enhanced>\n<file_list><path>.</path></file_list>\n<file_write><path>out.md</path><content>hello</content></file_write>`;
    const calls = parseToolCalls(response);
    assertEquals(calls.length, 3);
  });

  await t.step('returns empty for non-tool XML', () => {
    assertEquals(parseToolCalls('<html><body><p>Hi</p></body></html>').length, 0);
  });
});
