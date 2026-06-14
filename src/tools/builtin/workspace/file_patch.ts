import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';
import { ensureAgentWorkspace, resolveWorkspacePath } from '../../../workspace/paths.ts';
import { gitAutoCommit, gitEnsureBranch } from '../../../workspace/git.ts';
import { logFileEdit } from './common.ts';

export const filePatchTool: Tool = {
  definition: {
    name: 'file_patch',
    description: 'Apply a unified diff patch to a file.',
    capabilities: ['fs:edit', 'fs:write'],
    params: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to the file to patch',
        required: true,
      },
      {
        name: 'patch',
        type: 'string',
        description: 'Unified diff patch text',
        required: true,
      },
      {
        name: 'workspace',
        type: 'string',
        description: 'Target workspace: "agent" (default) or "global"',
        required: false,
        enum: ['agent', 'global'],
      },
    ],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();
    const rawPath = String(args.path ?? '');
    const patchText = String(args.patch ?? '');
    const workspace = (args.workspace as 'agent' | 'global') ?? 'agent';

    try {
      await ensureAgentWorkspace(context.agentId);
      const filePath = resolveWorkspacePath(context.agentId, rawPath, workspace);

      const beforeText = await Deno.readTextFile(filePath);

      // Try git apply first, fall back to simple parser
      const workspaceDir = workspace === 'agent'
        ? await ensureAgentWorkspace(context.agentId)
        : Deno.cwd();

      const tmpPatch = `${filePath}.patch`;
      await Deno.writeTextFile(tmpPatch, patchText);

      const cmd = new Deno.Command('git', {
        args: ['-C', workspaceDir, 'apply', tmpPatch],
        stdout: 'null',
        stderr: 'piped',
      });
      const result = await cmd.output();

      await Deno.remove(tmpPatch).catch(() => {});

      let afterText: string;
      if (result.success) {
        afterText = await Deno.readTextFile(filePath);
      } else {
        afterText = applySimplePatch(beforeText, patchText);
        await Deno.writeTextFile(filePath, afterText);
      }

      await gitEnsureBranch(workspaceDir, `workspace/${context.agentId}`);
      await gitAutoCommit(workspaceDir, context.agentId, filePath, 'file_patch');

      await logFileEdit({
        agentId: context.agentId,
        sessionId: context.sessionId,
        workspaceType: workspace,
        filePath,
        beforeText,
        afterText,
        tool: 'file_patch',
      });

      return {
        toolName: 'file_patch',
        success: true,
        output: `Patched ${filePath}`,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        toolName: 'file_patch',
        success: false,
        output: '',
        error: (err as Error).message,
        durationMs: Date.now() - start,
      };
    }
  },
};

function applySimplePatch(text: string, patch: string): string {
  const lines = text.split('\n');
  const patchLines = patch.split('\n');

  let result = [...lines];
  let i = 0;

  while (i < patchLines.length) {
    const line = patchLines[i];

    const hunkMatch = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
    if (hunkMatch) {
      const origStart = parseInt(hunkMatch[1]) - 1;
      const origCount = parseInt(hunkMatch[2] || '1');

      i++;
      const hunkLines: string[] = [];
      while (
        i < patchLines.length && !patchLines[i].startsWith('@@') &&
        !patchLines[i].startsWith('---') && !patchLines[i].startsWith('+++') &&
        !patchLines[i].startsWith('diff')
      ) {
        if (!patchLines[i].startsWith('\\')) hunkLines.push(patchLines[i]);
        i++;
      }

      const removed: string[] = [];
      const added: string[] = [];
      for (const hl of hunkLines) {
        if (hl.startsWith('-')) removed.push(hl.slice(1));
        else if (hl.startsWith('+')) added.push(hl.slice(1));
      }

      const beforeSection = result.slice(0, origStart);
      const afterSection = result.slice(origStart + origCount);

      // Verify context matches
      for (let j = 0; j < removed.length && j < origCount; j++) {
        if (result[origStart + j] !== removed[j]) {
          throw new Error(
            `Context mismatch at line ${origStart + j + 1}: expected "${removed[j]}", got "${
              result[origStart + j]
            }"`,
          );
        }
      }

      result = [...beforeSection, ...added, ...afterSection];
      continue;
    }
    i++;
  }

  return result.join('\n');
}

export default filePatchTool;
