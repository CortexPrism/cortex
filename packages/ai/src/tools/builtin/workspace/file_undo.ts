import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';
import { getCoreDb } from '../../../../../../src/db/client.ts';
import {
  ensureAgentWorkspace,
  resolveWorkspacePath,
} from '../../../../../../src/workspace/paths.ts';

const RESTORE_TOOLS = new Set(['file_write', 'file_edit', 'file_patch']);

export const fileUndoTool: Tool = {
  definition: {
    name: 'file_undo',
    description: 'Undo the most recent file operation in the workspace.',
    capabilities: ['fs:write'],
    params: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to the file to undo',
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
    const workspace = (args.workspace as 'agent' | 'global') ?? 'agent';

    try {
      await ensureAgentWorkspace(context.agentId);
      const resolvedPath = resolveWorkspacePath(context.agentId, rawPath, workspace);

      const db = await getCoreDb();
      const workspaceType = workspace;

      const query = `SELECT id, before_text, after_text, file_path, tool FROM file_edit_log
         WHERE agent_id = ? AND workspace_type = ? AND file_path = ?
         ORDER BY created_at DESC LIMIT 1`;
      const row = await db.get<{
        id: string;
        before_text: string;
        after_text: string;
        file_path: string;
        tool: string;
      }>(query, [context.agentId, workspaceType, resolvedPath]);

      if (!row) throw new Error('No edits found to undo');

      const tool = row.tool;

      if (tool === 'file_rename') {
        const afterText = row.after_text;
        const match = afterText.match(/^renamed to (.+)$/);
        if (match) {
          const newPath = match[1];
          try {
            await Deno.stat(newPath);
            await Deno.rename(newPath, resolvedPath);
            await db.run(
              `INSERT INTO file_edit_log (id, agent_id, session_id, workspace_type, file_path, before_text, after_text, before_hash, after_hash, tool)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                `undo_${Date.now().toString(36)}`,
                context.agentId,
                context.sessionId ?? null,
                workspaceType,
                resolvedPath,
                `renamed from ${newPath}`,
                '',
                '',
                '',
                'file_undo',
              ],
            );
            return {
              toolName: 'file_undo',
              success: true,
              output: `Undid rename: moved ${newPath} back to ${resolvedPath}`,
              durationMs: Date.now() - start,
            };
          } catch {
            throw new Error(`Cannot undo rename: file no longer exists at ${newPath}`);
          }
        }
        throw new Error('Cannot undo this rename operation (unexpected format)');
      }

      if (tool === 'file_delete') {
        await Deno.writeTextFile(resolvedPath, row.before_text);
        await db.run(
          `INSERT INTO file_edit_log (id, agent_id, session_id, workspace_type, file_path, before_text, after_text, before_hash, after_hash, tool)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `undo_${Date.now().toString(36)}`,
            context.agentId,
            context.sessionId ?? null,
            workspaceType,
            resolvedPath,
            '',
            row.before_text,
            '',
            '',
            'file_undo',
          ],
        );
        return {
          toolName: 'file_undo',
          success: true,
          output: `Undid deletion of ${resolvedPath}`,
          durationMs: Date.now() - start,
        };
      }

      if (RESTORE_TOOLS.has(tool)) {
        await Deno.writeTextFile(resolvedPath, row.before_text);
        await db.run(
          `INSERT INTO file_edit_log (id, agent_id, session_id, workspace_type, file_path, before_text, after_text, before_hash, after_hash, tool)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `undo_${Date.now().toString(36)}`,
            context.agentId,
            context.sessionId ?? null,
            workspaceType,
            resolvedPath,
            row.after_text,
            row.before_text,
            '',
            '',
            'file_undo',
          ],
        );
        return {
          toolName: 'file_undo',
          success: true,
          output: `Undid edit to ${resolvedPath}`,
          durationMs: Date.now() - start,
        };
      }

      throw new Error(`Cannot undo operation of type: ${tool}`);
    } catch (err) {
      return {
        toolName: 'file_undo',
        success: false,
        output: '',
        error: (err as Error).message,
        durationMs: Date.now() - start,
      };
    }
  },
};

export const fileRedoTool: Tool = {
  definition: {
    name: 'file_redo',
    description: 'Redo the most recently undone operation on a file.',
    capabilities: ['fs:write'],
    params: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to the file to redo',
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
    const workspace = (args.workspace as 'agent' | 'global') ?? 'agent';

    try {
      await ensureAgentWorkspace(context.agentId);
      const resolvedPath = resolveWorkspacePath(context.agentId, rawPath, workspace);

      const db = await getCoreDb();
      const workspaceType = workspace;

      const query = `SELECT id, before_text, after_text, file_path, tool FROM file_edit_log
         WHERE agent_id = ? AND workspace_type = ? AND file_path = ? AND tool = 'file_undo'
         ORDER BY created_at DESC LIMIT 1`;
      const row = await db.get<{
        id: string;
        before_text: string;
        after_text: string;
        file_path: string;
        tool: string;
      }>(query, [context.agentId, workspaceType, resolvedPath]);

      if (!row) throw new Error('No undo entries found to redo');

      await Deno.writeTextFile(resolvedPath, row.before_text);

      await db.run(
        `INSERT INTO file_edit_log (id, agent_id, session_id, workspace_type, file_path, before_text, after_text, before_hash, after_hash, tool)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `redo_${Date.now().toString(36)}`,
          context.agentId,
          context.sessionId ?? null,
          workspaceType,
          resolvedPath,
          row.after_text,
          row.before_text,
          '',
          '',
          'file_redo',
        ],
      );

      return {
        toolName: 'file_redo',
        success: true,
        output: `Redid edit to ${resolvedPath}`,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        toolName: 'file_redo',
        success: false,
        output: '',
        error: (err as Error).message,
        durationMs: Date.now() - start,
      };
    }
  },
};

export default fileUndoTool;
