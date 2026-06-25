import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';
import { ensureAgentWorkspace, resolveWorkspacePath } from '../../../workspace/paths.ts';
import { gitAutoCommit, gitEnsureBranch } from '../../../workspace/git.ts';
import { logFileEdit } from './common.ts';

interface LineOp {
  op: 'insert' | 'replace' | 'delete';
  line: number;
  endLine?: number;
  lines?: string[];
}

interface SearchReplace {
  old: string;
  new: string;
}

export const fileEditTool: Tool = {
  definition: {
    name: 'file_edit',
    description: 'Edit a file using line-based operations or search-replace blocks.',
    capabilities: ['fs:edit', 'fs:write'],
    params: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to the file',
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
        name: 'operations',
        type: 'array',
        description: 'List of line-based operations (op: insert|replace|delete)',
        required: false,
      },
      {
        name: 'edits',
        type: 'array',
        description: 'List of search-replace blocks ({old: string, new: string})',
        required: false,
      },
    ],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();
    const rawPath = String(args.path ?? '');
    const workspace = (args.workspace as 'agent' | 'global') ?? 'agent';
    const ws = context.agentWorkspace;

    try {
      await ensureAgentWorkspace(context.agentId);
      const filePath = resolveWorkspacePath(context.agentId, rawPath, workspace);

      const beforeText = ws && workspace === 'agent'
        ? await ws.readFile(filePath)
        : await Deno.readTextFile(filePath);

      let afterText: string;

      if (args.operations) {
        afterText = applyOperations(beforeText, args.operations as LineOp[]);
      } else if (args.edits) {
        afterText = applySearchReplace(beforeText, args.edits as SearchReplace[]);
      } else {
        throw new Error('Must provide either "operations" or "edits"');
      }

      if (!afterText.trim()) {
        throw new Error('Edit would produce an empty file — aborted');
      }

      if (ws && workspace === 'agent') {
        await ws.writeFile(filePath, afterText);
      } else {
        await Deno.writeTextFile(filePath, afterText);
      }

      const workspaceDir = workspace === 'agent'
        ? await ensureAgentWorkspace(context.agentId)
        : Deno.cwd();

      await gitEnsureBranch(workspaceDir, `workspace/${context.agentId}`);
      await gitAutoCommit(workspaceDir, context.agentId, filePath, 'file_edit');

      await logFileEdit({
        agentId: context.agentId,
        sessionId: context.sessionId,
        workspaceType: workspace,
        filePath,
        beforeText,
        afterText,
        tool: 'file_edit',
      });

      return {
        toolName: 'file_edit',
        success: true,
        output: `Edited ${filePath}`,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        toolName: 'file_edit',
        success: false,
        output: '',
        error: (err as Error).message,
        durationMs: Date.now() - start,
      };
    }
  },
};

function applyOperations(text: string, ops: LineOp[]): string {
  let lines = text.split('\n');

  for (const op of ops) {
    switch (op.op) {
      case 'insert': {
        const idx = Math.min(op.line - 1, lines.length);
        const insertLines = op.lines ?? [];
        lines = [...lines.slice(0, idx), ...insertLines, ...lines.slice(idx)];
        break;
      }
      case 'replace': {
        const startIdx = Math.max(0, op.line - 1);
        const endIdx = op.endLine ? Math.min(op.endLine - 1, lines.length) : startIdx + 1;
        const replaceLines = op.lines ?? [];
        lines = [...lines.slice(0, startIdx), ...replaceLines, ...lines.slice(endIdx)];
        break;
      }
      case 'delete': {
        const startIdx = Math.max(0, op.line - 1);
        const endIdx = op.endLine ? Math.min(op.endLine - 1, lines.length) : startIdx + 1;
        lines = [...lines.slice(0, startIdx), ...lines.slice(endIdx)];
        break;
      }
    }
  }

  return lines.join('\n');
}

function applySearchReplace(text: string, edits: SearchReplace[]): string {
  let result = text;

  for (const edit of edits) {
    if (!result.includes(edit.old)) {
      throw new Error(`Search-replace: block not found — "${edit.old.slice(0, 50)}..."`);
    }
    result = result.replace(edit.old, edit.new);
  }

  return result;
}

export default fileEditTool;
