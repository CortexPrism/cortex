import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';
import { ensureAgentWorkspace, resolveWorkspacePath } from '../../../workspace/paths.ts';

interface DiffLine {
  type: 'unchanged' | 'added' | 'removed' | 'modified';
  lineNum1?: number;
  lineNum2?: number;
  content: string;
}

function computeDiff(text1: string, text2: string, contextLines = 3): string {
  const lines1 = text1.split('\n');
  const lines2 = text2.split('\n');

  // Simple line-by-line diff
  const diffLines: DiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < lines1.length || j < lines2.length) {
    if (i >= lines1.length) {
      // Remaining lines in text2 are additions
      diffLines.push({ type: 'added', lineNum2: j + 1, content: lines2[j] });
      j++;
    } else if (j >= lines2.length) {
      // Remaining lines in text1 are deletions
      diffLines.push({ type: 'removed', lineNum1: i + 1, content: lines1[i] });
      i++;
    } else if (lines1[i] === lines2[j]) {
      // Lines match
      diffLines.push({
        type: 'unchanged',
        lineNum1: i + 1,
        lineNum2: j + 1,
        content: lines1[i],
      });
      i++;
      j++;
    } else {
      // Lines differ — look ahead to find next match
      const nextMatch = findNextMatch(lines1, lines2, i, j);

      if (nextMatch) {
        // Add removed lines
        for (let k = i; k < nextMatch.i1; k++) {
          diffLines.push({ type: 'removed', lineNum1: k + 1, content: lines1[k] });
        }
        // Add added lines
        for (let k = j; k < nextMatch.i2; k++) {
          diffLines.push({ type: 'added', lineNum2: k + 1, content: lines2[k] });
        }
        i = nextMatch.i1;
        j = nextMatch.i2;
      } else {
        // No match found — treat as replaced
        diffLines.push({ type: 'removed', lineNum1: i + 1, content: lines1[i] });
        diffLines.push({ type: 'added', lineNum2: j + 1, content: lines2[j] });
        i++;
        j++;
      }
    }
  }

  // Format output with context collapsing
  return formatDiff(diffLines, contextLines);
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

function formatDiff(diffLines: DiffLine[], contextLines: number): string {
  const output: string[] = [];
  let lastChangeIndex = -1;

  for (let i = 0; i < diffLines.length; i++) {
    const line = diffLines[i];

    if (line.type !== 'unchanged') {
      lastChangeIndex = i;

      // Include context before change
      const contextStart = Math.max(0, i - contextLines);
      for (let k = contextStart; k < i; k++) {
        if (diffLines[k].type === 'unchanged' && !output.includes(formatLine(diffLines[k]))) {
          output.push(formatLine(diffLines[k]));
        }
      }

      // Include the change
      output.push(formatLine(line));

      // Look ahead for more changes within context
      let j = i + 1;
      while (j < diffLines.length && j <= i + contextLines) {
        if (diffLines[j].type !== 'unchanged') {
          lastChangeIndex = j;
        }
        j++;
      }

      // Include context after if no more changes nearby
      if (i === lastChangeIndex) {
        const contextEnd = Math.min(diffLines.length, i + contextLines + 1);
        for (let k = i + 1; k < contextEnd; k++) {
          if (diffLines[k].type === 'unchanged') {
            output.push(formatLine(diffLines[k]));
          } else {
            break;
          }
        }

        // Add separator if there's more content
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

      // Compute diff
      const diff = computeDiff(text1, text2, contextLines);
      const stats = computeStats(text1, text2);

      const output = [
        `**Diff: ${path1} → ${path2}**`,
        '',
        `**Stats:** ${stats}`,
        '',
        '**Changes:**',
        '```diff',
        diff,
        '```',
        '',
        '**Legend:** `+` = added, `-` = removed, ` ` = unchanged context',
      ].join('\n');

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
