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
        { path: string; content?: string; patch?: string }
      >;
      const { workspaceDir } = context;

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

        if (file.patch) {
          return {
            toolName: 'sub_agent_apply',
            success: false,
            output: '',
            error: 'Patch-based apply is not yet supported. Use full-file content changes instead.',
            durationMs: Date.now() - startTime,
          };
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
