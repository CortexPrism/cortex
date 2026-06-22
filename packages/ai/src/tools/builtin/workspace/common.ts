import { getCoreDb } from '../../../../../../src/db/client.ts';
import { emitFileChange } from '../../../../../../src/workspace/events.ts';

function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16);
}

export interface EditLogEntry {
  agentId: string;
  sessionId?: string;
  workspaceType: 'agent' | 'global' | 'config';
  filePath: string;
  beforeText: string;
  afterText: string;
  tool: string;
}

export async function logFileEdit(entry: EditLogEntry): Promise<string> {
  const db = await getCoreDb();
  const id = `edit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  await db.run(
    `INSERT INTO file_edit_log (id, agent_id, session_id, workspace_type, file_path, before_text, after_text, before_hash, after_hash, tool)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      entry.agentId,
      entry.sessionId ?? null,
      entry.workspaceType,
      entry.filePath,
      entry.beforeText,
      entry.afterText,
      simpleHash(entry.beforeText),
      simpleHash(entry.afterText),
      entry.tool,
    ],
  );

  const action = entry.tool === 'file_delete'
    ? 'delete'
    : entry.tool === 'file_rename'
    ? 'rename'
    : 'write';
  emitFileChange({ agentId: entry.agentId, filePath: entry.filePath, action });

  return id;
}

export function simpleHashFn(text: string): string {
  return simpleHash(text);
}

export function nanoId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
