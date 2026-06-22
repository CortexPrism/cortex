import type { Tool, ToolCallResult, ToolContext } from '../../types.ts';
import {
  ensureAgentWorkspace,
  resolveWorkspacePath,
} from '../../../../../../src/workspace/paths.ts';
import { gitAutoCommit, gitEnsureBranch } from '../../../../../../src/workspace/git.ts';
import { logFileEdit } from './common.ts';
import { dirname } from '@std/path';
import { ensureDir } from '@std/fs';

export const fileCopyTool: Tool = {
  definition: {
    name: 'file_copy',
    description:
      'Copy a file or directory to a new location in the workspace. Preserves file metadata and creates parent directories as needed.',
    capabilities: ['fs:read', 'fs:write'],
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
          toolName: 'file_copy',
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
          toolName: 'file_copy',
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

      // Ensure parent directory exists
      await ensureDir(dirname(destPath));

      // Perform copy
      if (sourceInfo.isDirectory) {
        await copyDirectory(sourcePath, destPath);
      } else {
        await Deno.copyFile(sourcePath, destPath);
      }

      // Git integration
      const workspaceDir = workspace === 'agent'
        ? await ensureAgentWorkspace(context.agentId)
        : Deno.cwd();
      await gitEnsureBranch(workspaceDir, `workspace/${context.agentId}`);
      await gitAutoCommit(workspaceDir, context.agentId, destPath, 'file_copy');

      // Log the operation
      const content = sourceInfo.isFile ? await Deno.readTextFile(sourcePath).catch(() => '') : '';
      await logFileEdit({
        agentId: context.agentId,
        sessionId: context.sessionId,
        workspaceType: workspace,
        filePath: destPath,
        beforeText: '',
        afterText: content,
        tool: 'file_copy',
      });

      const typeStr = sourceInfo.isDirectory ? 'directory' : 'file';
      return {
        toolName: 'file_copy',
        success: true,
        output: `Copied ${typeStr} from ${sourcePath} to ${destPath}`,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        toolName: 'file_copy',
        success: false,
        output: '',
        error: (err as Error).message,
        errorInfo: {
          code: 'COPY_FAILED',
          message: (err as Error).message,
          retryable: true,
        },
        durationMs: Date.now() - start,
      };
    }
  },
};

async function copyDirectory(src: string, dest: string): Promise<void> {
  await ensureDir(dest);

  for await (const entry of Deno.readDir(src)) {
    const srcPath = `${src}/${entry.name}`;
    const destPath = `${dest}/${entry.name}`;

    if (entry.isDirectory) {
      await copyDirectory(srcPath, destPath);
    } else {
      await Deno.copyFile(srcPath, destPath);
    }
  }
}

export default fileCopyTool;
