import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';
import { ensureAgentWorkspace, resolveWorkspacePath } from '../../../workspace/paths.ts';

interface DiffLine {
  type: 'unchanged' | 'added' | 'removed' | 'modified';
  lineNum1?: number;
  lineNum2?: number;
  content: string;
}

function findNextMatch(
  lines1: string[],
  lines2: string[],
  start1: number,
  start2: number,
  lookahead = 10,
): { i1: number; i2: number } | null {
  for (let offset = 1; offset <= lookahead; offset++) {
    // Try matching line from text1 in text2
    if (start1 + offset < lines1.length) {
      for (let k = start2; k < Math.min(start2 + lookahead, lines2.length); k++) {
        if (lines1[start1 + offset] === lines2[k]) {
          return { i1: start1 + offset, i2: k };
        }
      }
    }
    // Try matching line from text2 in text1
    if (start2 + offset < lines2.length) {
      for (let k = start1; k < Math.min(start1 + lookahead, lines1.length); k++) {
        if (lines2[start2 + offset] === lines1[k]) {
          return { i1: k, i2: start2 + offset };
        }
      }
    }
  }
  return null;
}

function formatUnified(
  diffLines: DiffLine[],
  contextLines: number,
  path1: string,
  path2: string,
): string {
  const output: string[] = [
    `--- ${path1}`,
    `+++ ${path2}`,
  ];

  let i = 0;
  while (i < diffLines.length) {
    const hunkStart = findNextChange(diffLines, i);
    if (hunkStart === -1) break;

    const hunkBegin = Math.max(0, hunkStart - contextLines);
    const hunkEnd = Math.min(diffLines.length, findHunkEnd(diffLines, hunkStart, contextLines));

    const line1Start = diffLines[hunkBegin].lineNum1 ?? diffLines[hunkBegin].lineNum2 ??
      hunkBegin + 1;
    let removedCount = 0;
    let addedCount = 0;

    for (let k = hunkBegin; k < hunkEnd; k++) {
      if (diffLines[k].type === 'removed') removedCount++;
      if (diffLines[k].type === 'added') addedCount++;
    }

    const hunkContextLen = hunkEnd - hunkBegin;
    output.push(
      `@@ -${line1Start},${hunkContextLen - addedCount} +${
        diffLines[hunkBegin].lineNum2 ?? line1Start
      },${hunkContextLen - removedCount} @@`,
    );

    for (let k = hunkBegin; k < hunkEnd; k++) {
      const line = diffLines[k];
      if (line.type === 'added') {
        output.push(`+${line.content}`);
      } else if (line.type === 'removed') {
        output.push(`-${line.content}`);
      } else {
        output.push(` ${line.content}`);
      }
    }

    i = hunkEnd;
  }

  return output.join('\n');
}

function findNextChange(lines: DiffLine[], start: number): number {
  for (let i = start; i < lines.length; i++) {
    if (lines[i].type !== 'unchanged') return i;
  }
  return -1;
}

function findHunkEnd(lines: DiffLine[], changeStart: number, contextLines: number): number {
  let lastChange = changeStart;
  for (let i = changeStart; i < lines.length; i++) {
    if (lines[i].type !== 'unchanged') {
      lastChange = i;
    }
    if (i - lastChange > contextLines) {
      return i - contextLines;
    }
  }
  return lines.length;
}

function formatSideBySide(
  lines1: string[],
  lines2: string[],
  contextLines: number,
): string {
  const maxLines = Math.max(lines1.length, lines2.length);
  const colWidth = 60;
  const output: string[] = [];

  output.push(`${'='.repeat(colWidth)} | ${'='.repeat(colWidth)}`);
  output.push(`$ {'File 1 (before)'.padEnd(colWidth)} | File 2 (after)`);
  output.push(`${'='.repeat(colWidth)} | ${'='.repeat(colWidth)}`);

  const diffLines = buildDiffLines(lines1, lines2);

  for (const dl of diffLines) {
    const left = dl.type === 'added'
      ? ''.padEnd(colWidth)
      : truncateCol(dl.content, colWidth).padEnd(colWidth);
    const right = dl.type === 'removed'
      ? ''.padEnd(colWidth)
      : truncateCol(dl.content, colWidth).padEnd(colWidth);

    if (dl.type === 'unchanged') {
      output.push(`  ${left} |   ${right}`);
    } else if (dl.type === 'removed') {
      output.push(`- ${left} |   ${right}`);
    } else if (dl.type === 'added') {
      output.push(`  ${left} | + ${right}`);
    }
  }

  output.push(`${'='.repeat(colWidth)} | ${'='.repeat(colWidth)}`);
  return output.join('\n');
}

function buildDiffLines(lines1: string[], lines2: string[]): DiffLine[] {
  const diffLines: DiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < lines1.length || j < lines2.length) {
    if (i >= lines1.length) {
      diffLines.push({ type: 'added', lineNum2: j + 1, content: lines2[j] });
      j++;
    } else if (j >= lines2.length) {
      diffLines.push({ type: 'removed', lineNum1: i + 1, content: lines1[i] });
      i++;
    } else if (lines1[i] === lines2[j]) {
      diffLines.push({ type: 'unchanged', lineNum1: i + 1, lineNum2: j + 1, content: lines1[i] });
      i++;
      j++;
    } else {
      const nextMatch = findNextMatch(lines1, lines2, i, j);
      if (nextMatch) {
        for (let k = i; k < nextMatch.i1; k++) {
          diffLines.push({ type: 'removed', lineNum1: k + 1, content: lines1[k] });
        }
        for (let k = j; k < nextMatch.i2; k++) {
          diffLines.push({ type: 'added', lineNum2: k + 1, content: lines2[k] });
        }
        i = nextMatch.i1;
        j = nextMatch.i2;
      } else {
        diffLines.push({ type: 'removed', lineNum1: i + 1, content: lines1[i] });
        diffLines.push({ type: 'added', lineNum2: j + 1, content: lines2[j] });
        i++;
        j++;
      }
    }
  }
  return diffLines;
}

function truncateCol(text: string, width: number): string {
  return text.length > width ? text.substring(0, width - 3) + '...' : text;
}

function formatMinimal(diffLines: DiffLine[]): string {
  const output: string[] = [];
  for (const line of diffLines) {
    if (line.type === 'added') {
      output.push(`+ ${line.content}`);
    } else if (line.type === 'removed') {
      output.push(`- ${line.content}`);
    }
  }
  return output.join('\n');
}

function formatDefault(diffLines: DiffLine[], contextLines: number): string {
  const output: string[] = [];
  let lastChangeIndex = -1;

  for (let i = 0; i < diffLines.length; i++) {
    const line = diffLines[i];

    if (line.type !== 'unchanged') {
      lastChangeIndex = i;

      const contextStart = Math.max(0, i - contextLines);
      for (let k = contextStart; k < i; k++) {
        if (diffLines[k].type === 'unchanged' && !output.includes(formatLine(diffLines[k]))) {
          output.push(formatLine(diffLines[k]));
        }
      }

      output.push(formatLine(line));

      let j = i + 1;
      while (j < diffLines.length && j <= i + contextLines) {
        if (diffLines[j].type !== 'unchanged') {
          lastChangeIndex = j;
        }
        j++;
      }

      if (i === lastChangeIndex) {
        const contextEnd = Math.min(diffLines.length, i + contextLines + 1);
        for (let k = i + 1; k < contextEnd; k++) {
          if (diffLines[k].type === 'unchanged') {
            output.push(formatLine(diffLines[k]));
          } else {
            break;
          }
        }

        if (i + contextLines + 1 < diffLines.length) {
          output.push('...');
        }
      }
    }
  }

  return output.join('\n');
}

function formatLine(line: DiffLine): string {
  const lineNum = line.lineNum1 ?? line.lineNum2 ?? '?';
  switch (line.type) {
    case 'added':
      return `+ ${String(lineNum).padStart(4)} | ${line.content}`;
    case 'removed':
      return `- ${String(lineNum).padStart(4)} | ${line.content}`;
    case 'unchanged':
      return `  ${String(lineNum).padStart(4)} | ${line.content}`;
    default:
      return `  ${String(lineNum).padStart(4)} | ${line.content}`;
  }
}

function computeStats(text1: string, text2: string): string {
  const lines1 = text1.split('\n');
  const lines2 = text2.split('\n');

  let added = 0;
  let removed = 0;
  let unchanged = 0;

  const maxLen = Math.max(lines1.length, lines2.length);
  for (let i = 0; i < maxLen; i++) {
    if (i >= lines1.length) {
      added++;
    } else if (i >= lines2.length) {
      removed++;
    } else if (lines1[i] === lines2[i]) {
      unchanged++;
    } else {
      added++;
      removed++;
    }
  }

  const total = added + removed + unchanged;
  return `Lines: ${total} total, ${added} added (+), ${removed} removed (-), ${unchanged} unchanged`;
}

export const fileDiffTool: Tool = {
  definition: {
    name: 'file_diff',
    description:
      'Compare two files or versions and display differences in unified diff format. Shows additions, deletions, and context lines.',
    capabilities: ['fs:read'],
    params: [
      {
        name: 'path1',
        type: 'string',
        description: 'Path to the first file (or "before" version)',
        required: true,
      },
      {
        name: 'path2',
        type: 'string',
        description: 'Path to the second file (or "after" version)',
        required: true,
      },
      {
        name: 'workspace',
        type: 'string',
        description: 'Target workspace: "agent" (default) or "global"',
        required: false,
        enum: ['agent', 'global'],
      },
      {
        name: 'context_lines',
        type: 'number',
        description: 'Number of context lines around changes (default: 3)',
        required: false,
      },
      {
        name: 'format',
        type: 'string',
        description:
          'Diff output format: "default" (line-numbered), "unified" (git-style with @@ headers), "side_by_side" (two-column comparison), "minimal" (only added/removed lines). Default: "default".',
        required: false,
        enum: ['default', 'unified', 'side_by_side', 'minimal'],
      },
      {
        name: 'syntax_hint',
        type: 'string',
        description:
          'Optional language for syntax highlighting in code block (e.g., "typescript", "python", "json"). Adds language tag to markdown code fence.',
        required: false,
      },
    ],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();
    const rawPath1 = String(args.path1 ?? '');
    const rawPath2 = String(args.path2 ?? '');
    const workspace = (args.workspace as 'agent' | 'global') ?? 'agent';
    const contextLines = typeof args.context_lines === 'number' ? args.context_lines : 3;

    try {
      if (workspace === 'agent') await ensureAgentWorkspace(context.agentId);

      const path1 = resolveWorkspacePath(context.agentId, rawPath1, workspace);
      const path2 = resolveWorkspacePath(context.agentId, rawPath2, workspace);

      // Read both files
      let text1: string;
      let text2: string;

      try {
        text1 = await Deno.readTextFile(path1);
      } catch {
        return {
          toolName: 'file_diff',
          success: false,
          output: '',
          error: `Cannot read first file: ${path1}`,
          errorInfo: {
            code: 'FILE_NOT_FOUND',
            message: 'First file does not exist or is not readable',
            retryable: false,
          },
          durationMs: Date.now() - start,
        };
      }

      try {
        text2 = await Deno.readTextFile(path2);
      } catch {
        return {
          toolName: 'file_diff',
          success: false,
          output: '',
          error: `Cannot read second file: ${path2}`,
          errorInfo: {
            code: 'FILE_NOT_FOUND',
            message: 'Second file does not exist or is not readable',
            retryable: false,
          },
          durationMs: Date.now() - start,
        };
      }

      // Check if files are identical
      if (text1 === text2) {
        return {
          toolName: 'file_diff',
          success: true,
          output: `Files are identical.\n\nPath 1: ${path1}\nPath 2: ${path2}`,
          durationMs: Date.now() - start,
        };
      }

      // Get format and syntax hint
      const format = (args.format as string) ?? 'default';
      const syntaxHint = (args.syntax_hint as string | undefined) ?? null;
      const codeFence = syntaxHint ? `\`\`\`${syntaxHint}` : '```diff';

      // Compute diff lines
      const lines1 = text1.split('\n');
      const lines2 = text2.split('\n');
      const diffLines = buildDiffLines(lines1, lines2);
      const stats = computeStats(text1, text2);

      let formattedDiff: string;
      let legend: string;

      switch (format) {
        case 'unified':
          formattedDiff = formatUnified(diffLines, contextLines, path1, path2);
          legend = '';
          break;
        case 'side_by_side':
          formattedDiff = formatSideBySide(lines1, lines2, contextLines);
          legend =
            '\n**Legend:** Left column = file 1 (before), Right column = file 2 (after), `-` = removed, `+` = added';
          break;
        case 'minimal':
          formattedDiff = formatMinimal(diffLines);
          legend = '\n**Legend:** `+` = added, `-` = removed';
          break;
        default:
          formattedDiff = formatDefault(diffLines, contextLines);
          legend = '\n**Legend:** `+` = added, `-` = removed, ` ` = unchanged context';
          break;
      }

      const outputParts = [
        `**Diff: ${path1} → ${path2}**`,
        '',
        `**Stats:** ${stats}`,
      ];

      if (format === 'unified') {
        outputParts.push('', codeFence, formattedDiff, '```');
      } else {
        outputParts.push('', '**Changes:**', codeFence, formattedDiff, '```');
      }

      outputParts.push('', legend);

      const output = outputParts.join('\n');

      return {
        toolName: 'file_diff',
        success: true,
        output,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        toolName: 'file_diff',
        success: false,
        output: '',
        error: (err as Error).message,
        errorInfo: {
          code: 'DIFF_FAILED',
          message: (err as Error).message,
          retryable: true,
        },
        durationMs: Date.now() - start,
      };
    }
  },
};

export default fileDiffTool;
