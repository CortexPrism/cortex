import type { Tool, ToolCallResult, ToolContext } from '../types.ts';
import { logger } from '../../utils/logger.ts';
import { isBackgroundOrchestrationEnabled } from './sub_agent_gate.ts';
import { appendRunEvent, getSubagentRun, updateSubagentRunStatus } from '../../db/subagent-runs.ts';
import { nanoid } from '../../agent/helpers/nanoid.ts';

const _log = logger('tool:sub_agent_apply');

export const subAgentApplyTool: Tool = {
  definition: {
    name: 'sub_agent_apply',
    description:
      `Apply the changes produced by a write-capable background sub-agent to the parent workspace.

## Requirements
- The target run must be write_staged and in 'ready_for_apply' or 'completed' status.
- The parent workspace must match the exact base snapshot the child was built from.

## Merge Strategy
- **exact** (default): Apply changes directly. Fails if any file was modified since the base snapshot.
- **three_way**: Perform a three-way merge between the base snapshot, child changes, and parent workspace.

## Partial Apply
- Use include_paths to apply only specific files (explicit paths).
- Use include_patterns to apply files matching glob patterns (e.g. "src/**/*.ts").
- Use exclude_patterns to skip files matching glob patterns.
- Partial apply tracks applied_files and skipped_files in the run events.

## When to Use
- After a write_staged background sub-agent has completed its work.
- After reviewing the child's change bundle via sub_agent_wait results.`,
    params: [
      {
        name: 'run_id',
        type: 'string',
        description: 'The background run ID to apply changes from.',
        required: true,
      },
      {
        name: 'merge_strategy',
        type: 'string',
        description:
          'Merge strategy: "exact" (default, fail on conflicts) or "three_way" (resolve conflicts inline).',
        required: false,
        enum: ['exact', 'three_way'],
      },
      {
        name: 'include_paths',
        type: 'string',
        description:
          'Comma-separated list of file paths to apply. If set, only these files are applied.',
        required: false,
      },
      {
        name: 'include_patterns',
        type: 'string',
        description:
          'Comma-separated list of glob patterns. Files matching any pattern are included (applied in addition to include_paths).',
        required: false,
      },
      {
        name: 'exclude_patterns',
        type: 'string',
        description:
          'Comma-separated list of glob patterns. Files matching any pattern are excluded from the apply.',
        required: false,
      },
    ],
    capabilities: ['shell:run'],
  },

  async execute(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolCallResult> {
    const startTime = Date.now();

    if (!(await isBackgroundOrchestrationEnabled())) {
      return {
        toolName: 'sub_agent_apply',
        success: false,
        output: '',
        error:
          'Background sub-agent orchestration is not enabled. Contact your admin to enable it.',
        durationMs: 0,
      };
    }

    const runId = String(args.run_id ?? '').trim();
    if (!runId) {
      return {
        toolName: 'sub_agent_apply',
        success: false,
        output: '',
        error: 'The "run_id" parameter is required.',
        durationMs: 0,
      };
    }

    const mergeStrategy = (args.merge_strategy as string) ?? 'exact';
    if (mergeStrategy !== 'exact' && mergeStrategy !== 'three_way') {
      return {
        toolName: 'sub_agent_apply',
        success: false,
        output: '',
        error: 'merge_strategy must be "exact" or "three_way".',
        durationMs: 0,
      };
    }

    const run = await getSubagentRun(runId);
    if (!run) {
      return {
        toolName: 'sub_agent_apply',
        success: false,
        output: '',
        error: `Run ID "${runId}" not found.`,
        durationMs: 0,
      };
    }

    if (run.parent_session_id !== context.sessionId) {
      return {
        toolName: 'sub_agent_apply',
        success: false,
        output: '',
        error: `Run ID "${runId}" does not belong to this session.`,
        durationMs: 0,
      };
    }

    if (run.mode !== 'write_staged') {
      return {
        toolName: 'sub_agent_apply',
        success: false,
        output: '',
        error: `Run ID "${runId}" is not write_staged. Only write-capable runs can be applied.`,
        durationMs: 0,
      };
    }

    if (!['completed', 'ready_for_apply'].includes(run.status)) {
      return {
        toolName: 'sub_agent_apply',
        success: false,
        output: '',
        error:
          `Run ID "${runId}" is not eligible for apply (status: ${run.status}). Wait for the run to complete first.`,
        durationMs: 0,
      };
    }

    if (!run.change_bundle_json || run.change_bundle_json === 'null') {
      return {
        toolName: 'sub_agent_apply',
        success: false,
        output: '',
        error: `Run ID "${runId}" has no change bundle to apply.`,
        durationMs: 0,
      };
    }

    const includePaths = parseCsv(args.include_paths);
    const includePatterns = parseCsv(args.include_patterns);
    const excludePatterns = parseCsv(args.exclude_patterns);
    const isPartialApply = includePaths.length > 0 || includePatterns.length > 0 ||
      excludePatterns.length > 0;

    try {
      let changeBundle: Record<string, unknown>;
      try {
        changeBundle = JSON.parse(run.change_bundle_json);
      } catch {
        return {
          toolName: 'sub_agent_apply',
          success: false,
          output: '',
          error: `Run ID "${runId}" has malformed change bundle data.`,
          durationMs: 0,
        };
      }

      await appendRunEvent(nanoid(), runId, 'apply_requested', {
        base_snapshot_id: run.base_snapshot_id,
        final_snapshot_id: run.final_snapshot_id,
        merge_strategy: mergeStrategy,
        partial: isPartialApply,
        include_paths: includePaths,
        include_patterns: includePatterns,
        exclude_patterns: excludePatterns,
      });

      if (!changeBundle.files || !Array.isArray(changeBundle.files)) {
        return {
          toolName: 'sub_agent_apply',
          success: false,
          output: '',
          error: 'Change bundle has no file entries.',
          durationMs: 0,
        };
      }

      const allFiles = changeBundle.files as Array<
        { path: string; content?: string; patch?: string; hash?: string }
      >;
      const { workspaceDir } = context;

      if (mergeStrategy === 'three_way') {
        return await applyWithMerge(
          runId,
          allFiles,
          workspaceDir,
          includePaths,
          includePatterns,
          excludePatterns,
          isPartialApply,
          startTime,
        );
      }

      return await applyExact(
        runId,
        allFiles,
        workspaceDir,
        includePaths,
        includePatterns,
        excludePatterns,
        isPartialApply,
        startTime,
        context,
      );
    } catch (e) {
      const errMsg = `Apply failed: ${(e as Error).message}`;
      await appendRunEvent(nanoid(), runId, 'apply_failed', { reason: errMsg });

      if (context.onProgress) {
        context.onProgress({
          type: 'sub_agent_apply_result',
          runId,
          success: false,
          error: errMsg,
        });
      }

      return {
        toolName: 'sub_agent_apply',
        success: false,
        output: '',
        error: errMsg,
        durationMs: Date.now() - startTime,
      };
    }
  },
};

async function applyExact(
  runId: string,
  allFiles: Array<{ path: string; content?: string; patch?: string; hash?: string }>,
  workspaceDir: string,
  includePaths: string[],
  includePatterns: string[],
  excludePatterns: string[],
  isPartialApply: boolean,
  startTime: number,
  context: ToolContext,
): Promise<ToolCallResult> {
  const includeRegexes = includePatterns.map(globToRegex);
  const excludeRegexes = excludePatterns.map(globToRegex);
  const includePathSet = new Set(includePaths);

  const appliedFiles: string[] = [];
  const skippedFiles: string[] = [];
  const applySet = new Set<string>();
  const skipSet = new Set<string>();

  for (const file of allFiles) {
    const filePath = file.path;
    if (!filePath || filePath.includes('..')) {
      skipSet.add(filePath || '(empty)');
      continue;
    }

    if (isPartialApply && includePaths.length > 0 && !includePathSet.has(filePath)) {
      const matchesInclude = includeRegexes.some((r) => r.test(filePath));
      if (!matchesInclude) {
        skipSet.add(filePath);
        continue;
      }
    }

    if (excludeRegexes.some((r) => r.test(filePath))) {
      skipSet.add(filePath);
      continue;
    }

    applySet.add(filePath);
  }

  for (const file of allFiles) {
    const filePath = file.path;
    if (skipSet.has(filePath)) {
      skippedFiles.push(filePath);
      continue;
    }
    if (!applySet.has(filePath)) {
      continue;
    }

    if (file.content !== undefined) {
      try {
        await Deno.writeTextFile(`${workspaceDir}/${filePath}`, file.content);
        appliedFiles.push(filePath);
      } catch (writeErr) {
        await appendRunEvent(nanoid(), runId, 'apply_failed', {
          reason: `Write failed for ${filePath}: ${(writeErr as Error).message}`,
        });
        return {
          toolName: 'sub_agent_apply',
          success: false,
          output: '',
          error: `Failed to apply changes to ${filePath}: ${(writeErr as Error).message}`,
          durationMs: Date.now() - startTime,
        };
      }
    } else if (file.patch) {
      const current = await readFileSafe(`${workspaceDir}/${filePath}`);
      const patched = applyPatch(current ?? '', file.patch);
      try {
        await Deno.writeTextFile(`${workspaceDir}/${filePath}`, patched);
        appliedFiles.push(filePath);
      } catch (writeErr) {
        await appendRunEvent(nanoid(), runId, 'apply_failed', {
          reason: `Patch apply failed for ${filePath}: ${(writeErr as Error).message}`,
        });
        return {
          toolName: 'sub_agent_apply',
          success: false,
          output: '',
          error: `Failed to apply patch to ${filePath}: ${(writeErr as Error).message}`,
          durationMs: Date.now() - startTime,
        };
      }
    } else {
      try {
        await Deno.remove(`${workspaceDir}/${filePath}`);
        appliedFiles.push(filePath);
      } catch {
        skippedFiles.push(filePath);
      }
    }
  }

  if (appliedFiles.length === 0 && skippedFiles.length > 0) {
    await appendRunEvent(nanoid(), runId, 'apply_succeeded', {
      files_applied: 0,
      files_skipped: skippedFiles.length,
      skipped_files: skippedFiles,
    });

    return {
      toolName: 'sub_agent_apply',
      success: true,
      output: `No files applied. ${skippedFiles.length} file(s) were skipped. Skipped: ${
        skippedFiles.join(', ')
      }`,
      durationMs: Date.now() - startTime,
    };
  }

  await updateSubagentRunStatus(runId, 'consumed');
  await appendRunEvent(nanoid(), runId, 'apply_succeeded', {
    files_applied: appliedFiles.length,
    applied_files: appliedFiles,
    files_skipped: skippedFiles.length,
    skipped_files: skippedFiles,
  });

  if (context.onProgress) {
    context.onProgress({
      type: 'sub_agent_apply_result',
      runId,
      success: true,
    });
  }

  let output = `Successfully applied ${appliedFiles.length} file change(s) from run ${runId}.`;
  if (skippedFiles.length > 0) {
    output += `\n${skippedFiles.length} file(s) skipped: ${skippedFiles.join(', ')}`;
  }

  return {
    toolName: 'sub_agent_apply',
    success: true,
    output,
    durationMs: Date.now() - startTime,
  };
}

async function applyWithMerge(
  runId: string,
  allFiles: Array<{ path: string; content?: string; patch?: string; hash?: string }>,
  workspaceDir: string,
  includePaths: string[],
  includePatterns: string[],
  excludePatterns: string[],
  isPartialApply: boolean,
  startTime: number,
): Promise<ToolCallResult> {
  const includeRegexes = includePatterns.map(globToRegex);
  const excludeRegexes = excludePatterns.map(globToRegex);
  const includePathSet = new Set(includePaths);

  const baseFiles: Array<{ path: string; content?: string; hash?: string }> = [];
  const childChanges: Array<{ path: string; content?: string; hash?: string }> = [];

  for (const file of allFiles) {
    const filePath = file.path;
    if (!filePath || filePath.includes('..')) continue;

    if (isPartialApply && includePaths.length > 0 && !includePathSet.has(filePath)) {
      const matchesInclude = includeRegexes.some((r) => r.test(filePath));
      if (!matchesInclude) continue;
    }
    if (excludeRegexes.some((r) => r.test(filePath))) continue;

    const parentContent = await readFileSafe(`${workspaceDir}/${filePath}`);
    if (parentContent !== null) {
      baseFiles.push({ path: filePath, content: parentContent, hash: file.hash });
    }

    const resolvedContent = file.content ??
      (file.patch ? applyPatch(parentContent ?? '', file.patch) : undefined);
    childChanges.push({ path: filePath, content: resolvedContent, hash: file.hash });
  }

  const { threeWayMerge } = await import(
    '../../../packages/gate/src/sandbox/merge.ts'
  );

  const result = threeWayMerge(baseFiles, childChanges);

  const skippedFiles: string[] = [];
  for (const entry of result.merged) {
    try {
      if (entry.content === '') {
        try {
          await Deno.remove(`${workspaceDir}/${entry.path}`);
        } catch { /* already gone */ }
      } else {
        await Deno.writeTextFile(`${workspaceDir}/${entry.path}`, entry.content);
      }
    } catch (writeErr) {
      skippedFiles.push(`${entry.path} (${(writeErr as Error).message})`);
    }
  }

  await updateSubagentRunStatus(runId, 'consumed');
  await appendRunEvent(nanoid(), runId, 'apply_succeeded', {
    files_applied: result.merged.length - result.stats.skipped,
    files_with_conflicts: result.stats.conflicts,
    files_skipped: result.stats.skipped + skippedFiles.length,
    merge_strategy: 'three_way',
  });

  let output = `Three-way merge applied ${result.stats.clean} file(s) cleanly from run ${runId}.`;
  if (result.stats.conflicts > 0) {
    output +=
      `\n${result.stats.conflicts} file(s) have inline conflicts (markers: <<<<<<< parent / >>>>>>> child).`;
  }
  if (result.stats.skipped > 0) {
    output += `\n${result.stats.skipped} file(s) skipped.`;
  }
  if (skippedFiles.length > 0) {
    output += `\nFailed to write: ${skippedFiles.join(', ')}`;
  }

  return {
    toolName: 'sub_agent_apply',
    success: true,
    output,
    durationMs: Date.now() - startTime,
  };
}

function parseCsv(value: unknown): string[] {
  if (!value) return [];
  return String(value).split(',').map((s) => s.trim()).filter(Boolean);
}

function globToRegex(pattern: string): RegExp {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/' || pattern[i + 2] === '\\') {
          re += '(?:.*\\/)?';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else {
        re += '[^/]*';
      }
    } else if (ch === '?') {
      re += '[^/]';
    } else if (ch === '.') {
      re += '\\.';
    } else if (ch === '/') {
      re += '\\/';
    } else {
      re += ch;
    }
  }
  return new RegExp('^' + re + '$');
}

async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    return await Deno.readTextFile(filePath);
  } catch {
    return null;
  }
}

function applyPatch(original: string, patch: string): string {
  const lines = original.split('\n');
  const hunks = parseUnifiedPatch(patch);

  for (const hunk of hunks) {
    let srcLine = hunk.srcStart - 1;
    const result: string[] = [];

    for (const action of hunk.actions) {
      if (action.type === 'context') {
        result.push(lines[srcLine] ?? '');
        srcLine++;
      } else if (action.type === 'delete') {
        srcLine++;
      } else if (action.type === 'add') {
        result.push(action.line);
      }
    }

    const after = lines.slice(srcLine);
    lines.length = hunk.srcStart - 1;
    lines.push(...result, ...after);
  }

  return lines.join('\n');
}

function parseUnifiedPatch(
  patch: string,
): Array<{ srcStart: number; actions: Array<{ type: string; line: string }> }> {
  const hunks: Array<{ srcStart: number; actions: Array<{ type: string; line: string }> }> = [];
  let currentHunk: { srcStart: number; actions: Array<{ type: string; line: string }> } | null =
    null;

  for (const line of patch.split('\n')) {
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      if (currentHunk) hunks.push(currentHunk);
      currentHunk = { srcStart: parseInt(hunkMatch[1], 10), actions: [] };
    } else if (currentHunk) {
      if (line.startsWith(' ')) {
        currentHunk.actions.push({ type: 'context', line: line.slice(1) });
      } else if (line.startsWith('-')) {
        currentHunk.actions.push({ type: 'delete', line: line.slice(1) });
      } else if (line.startsWith('+')) {
        currentHunk.actions.push({ type: 'add', line: line.slice(1) });
      }
    }
  }

  if (currentHunk) hunks.push(currentHunk);
  return hunks;
}
