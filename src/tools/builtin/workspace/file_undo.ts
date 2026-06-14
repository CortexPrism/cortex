import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';
import { getCoreDb } from '../../../db/client.ts';

export const fileUndoTool: Tool = {
  definition: {
    name: 'file_undo',
    description: 'Undo the most recent edit to a file in the workspace.',
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
      const db = await getCoreDb();
      const workspaceType = workspace;

      let query = `SELECT id, before_text, after_text, file_path FROM file_edit_log
         WHERE agent_id = ? AND workspace_type = ?`;
      const params: string[] = [context.agentId, workspaceType];
      if (rawPath) { query += ` AND file_path = ?`; params.push(rawPath); }
      query += ` ORDER BY created_at DESC LIMIT 1`;

      const row = await db.get<{
        id: string;
        before_text: string;
        after_text: string;
        file_path: string;
      }>(query, params);

      if (!row) throw new Error('No edits found to undo');

      await Deno.writeTextFile(row.file_path, row.before_text);

      // Log the undo as a new entry
      await db.run(
        `INSERT INTO file_edit_log (id, agent_id, session_id, workspace_type, file_path, before_text, after_text, before_hash, after_hash, tool)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `undo_${Date.now().toString(36)}`,
          context.agentId,
          context.sessionId ?? null,
          workspaceType,
          row.file_path,
          row.after_text,
          row.before_text,
          '', '',
          'file_undo',
        ],
      );

      return {
        toolName: 'file_undo',
        success: true,
        output: `Undid edit to ${row.file_path}`,
        durationMs: Date.now() - start,
      };
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
    description: 'Redo the most recently undone edit to a file.',
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
      const db = await getCoreDb();
      const workspaceType = workspace;

      let query = `SELECT id, before_text, after_text, file_path FROM file_edit_log
         WHERE agent_id = ? AND workspace_type = ? AND tool = 'file_undo'`;
      const params: string[] = [context.agentId, workspaceType];
      if (rawPath) { query += ` AND file_path = ?`; params.push(rawPath); }
      query += ` ORDER BY created_at DESC LIMIT 1`;

      const row = await db.get<{
        id: string;
        before_text: string;
        after_text: string;
        file_path: string;
      }>(query, params);

      if (!row) throw new Error('No undo entries found to redo');

      await Deno.writeTextFile(row.file_path, row.after_text);

      await db.run(
        `INSERT INTO file_edit_log (id, agent_id, session_id, workspace_type, file_path, before_text, after_text, before_hash, after_hash, tool)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `redo_${Date.now().toString(36)}`,
          context.agentId,
          context.sessionId ?? null,
          workspaceType,
          row.file_path,
          row.before_text,
          row.after_text,
          '', '',
          'file_redo',
        ],
      );

      return {
        toolName: 'file_redo',
        success: true,
        output: `Redid edit to ${row.file_path}`,
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
