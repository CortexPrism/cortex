import { assertEquals } from '@std/assert';
import { Db } from '../src/db/client.ts';
import { join } from '@std/path';

Deno.test('file_edit_log table can be created and queried', async () => {
  const tmpDir = await Deno.makeTempDir();
  const dbPath = join(tmpDir, 'test.db');
  const db = new Db(dbPath);
  await db.init();

  const sql = await Deno.readTextFile(
    join(new URL('..', import.meta.url).pathname, 'src/db/migrations/011_workspace.sql'),
  );
  await db.exec(sql);

  // Insert a test edit log entry
  await db.run(
    `INSERT INTO file_edit_log (id, agent_id, session_id, workspace_type, file_path, before_text, after_text, before_hash, after_hash, tool)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['test_1', 'agent-1', 'sess-1', 'agent', '/test/file.txt', 'old', 'new', 'abc', 'def', 'file_write'],
  );

  const row = await db.get<{ agent_id: string; file_path: string }>(
    `SELECT * FROM file_edit_log WHERE id = ?`,
    ['test_1'],
  );
  if (!row) throw new Error('Row should exist');
  assertEquals(row.agent_id, 'agent-1');
  assertEquals(row.file_path, '/test/file.txt');

  // Test workspace_config table
  await db.run(
    `INSERT INTO workspace_config (id, agent_id, workspace_dir, git_branch)
     VALUES (?, ?, ?, ?)`,
    ['ws_1', 'agent-1', '/workspaces/agent-1', 'main'],
  );

  const ws = await db.get<{ agent_id: string; workspace_dir: string }>(
    `SELECT * FROM workspace_config WHERE id = ?`,
    ['ws_1'],
  );
  if (!ws) throw new Error('Workspace config row should exist');
  assertEquals(ws.agent_id, 'agent-1');

  db.close();
  await Deno.remove(tmpDir, { recursive: true });
});
