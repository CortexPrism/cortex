import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';
import { ensureAgentWorkspace, resolveWorkspacePath } from '../../../../../../src/workspace/paths.ts';
import { gitAutoCommit, gitEnsureBranch } from '../../../../../../src/workspace/git.ts';
import { logFileEdit } from './common.ts';
import { dirname } from '@std/path';
import { ensureDir } from '@std/fs';

export const fileMoveTool: Tool = {
  definition: {
    name: 'file_move',
    description:
      'Move or rename a file or directory to a new location. Creates parent directories as needed. More efficient than copy+delete for large files.',
    capabilities: ['fs:read', 'fs:write', 'fs:delete'],
    params: [
      {
        name: 'source',
        type: 'string',
        description: 'Path to the source file or directory',
        required: true,
      },
      {
        name: 'destination',
        type: 'string',
        description: 'Path to the destination (new file/directory path)',
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
        name: 'overwrite',
        type: 'boolean',
        description: 'Overwrite destination if it exists (default: false)',
        required: false,
      },
    ],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();
    const rawSource = String(args.source ?? '');
    const rawDestination = String(args.destination ?? '');
    const workspace = (args.workspace as 'agent' | 'global') ?? 'agent';
    const overwrite = args.overwrite === true;

    try {
      if (workspace === 'agent') await ensureAgentWorkspace(context.agentId);

      const sourcePath = resolveWorkspacePath(context.agentId, rawSource, workspace);
      const destPath = resolveWorkspacePath(context.agentId, rawDestination, workspace);

      // Check source exists
      let sourceInfo;
      try {
        sourceInfo = await Deno.stat(sourcePath);
      } catch {
        return {
          toolName: 'file_move',
          success: false,
          output: '',
          error: `Source not found: ${sourcePath}`,
          errorInfo: {
            code: 'SOURCE_NOT_FOUND',
            message: 'Source file or directory does not exist',
            retryable: false,
          },
          durationMs: Date.now() - start,
        };
      }

      // Check destination
      const destExists = await Deno.stat(destPath).then(() => true).catch(() => false);
      if (destExists && !overwrite) {
        return {
          toolName: 'file_move',
          success: false,
          output: '',
          error: `Destination already exists: ${destPath}. Use overwrite=true to replace.`,
          errorInfo: {
            code: 'DESTINATION_EXISTS',
            message: 'Destination already exists',
            retryable: false,
            suggestedAction: 'Set overwrite=true to replace the existing file/directory',
          },
          durationMs: Date.now() - start,
        };
      }

      // Read content for logging (files only)
      const beforeContent = sourceInfo.isFile
        ? await Deno.readTextFile(sourcePath).catch(() => '')
        : '';

      // Ensure parent directory exists
      await ensureDir(dirname(destPath));

      // Remove destination if overwriting
      if (destExists && overwrite) {
        await Deno.remove(destPath, { recursive: true });
      }

      // Perform move (atomic rename if possible)
      await Deno.rename(sourcePath, destPath);

      // Git integration
      const workspaceDir = workspace === 'agent'
        ? await ensureAgentWorkspace(context.agentId)
        : Deno.cwd();
      await gitEnsureBranch(workspaceDir, `workspace/${context.agentId}`);

      // Add both source (delete) and destination (add) to git
      await gitAutoCommit(workspaceDir, context.agentId, sourcePath, 'file_move_from');
      await gitAutoCommit(workspaceDir, context.agentId, destPath, 'file_move_to');

      // Log the operation for the destination (new location)
      await logFileEdit({
        agentId: context.agentId,
        sessionId: context.sessionId,
        workspaceType: workspace,
        filePath: destPath,
        beforeText: '',
        afterText: beforeContent,
        tool: 'file_move',
      });

      // Log deletion of source
      await logFileEdit({
        agentId: context.agentId,
        sessionId: context.sessionId,
        workspaceType: workspace,
        filePath: sourcePath,
        beforeText: beforeContent,
        afterText: '',
        tool: 'file_move',
      });

      const typeStr = sourceInfo.isDirectory ? 'directory' : 'file';
      return {
        toolName: 'file_move',
        success: true,
        output: `Moved ${typeStr} from ${sourcePath} to ${destPath}`,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        toolName: 'file_move',
        success: false,
        output: '',
        error: (err as Error).message,
        errorInfo: {
          code: 'MOVE_FAILED',
          message: (err as Error).message,
          retryable: true,
        },
        durationMs: Date.now() - start,
      };
    }
  },
};

export default fileMoveTool;
