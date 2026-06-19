import { getCoreDb } from '../db/client.ts';
import { runInSandbox } from './executor.ts';
import type { BugReproRun } from './snapshot-types.ts';
import type { SandboxRuntime } from './executor.ts';

function generateId(): string {
  return `bugrepro-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function createBugRepro(opts: {
  issueTitle: string;
  issueDescription: string;
  language: string;
  code: string;
  testCode?: string;
  runtime?: SandboxRuntime;
  sessionId?: string;
  tags?: string[];
}): Promise<BugReproRun> {
  const id = generateId();

  const run: BugReproRun = {
    id,
    issueTitle: opts.issueTitle,
    issueDescription: opts.issueDescription,
    language: opts.language,
    code: opts.code,
    testCode: opts.testCode ?? '',
    runtime: opts.runtime ?? 'docker',
    status: 'queued',
    rounds: 0,
    createdAt: new Date().toISOString(),
    sessionId: opts.sessionId ?? '',
    tags: opts.tags ?? [],
  };

  const db = await getCoreDb();
  await db.run(
    `INSERT INTO bug_repro_runs (id, issue_title, issue_description, language, runtime, status, code, test_code, created_at, session_id, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, opts.issueTitle, opts.issueDescription, opts.language, run.runtime, 'queued', opts.code, opts.testCode ?? '', run.createdAt, run.sessionId, JSON.stringify(run.tags)],
  );

  return run;
}

export async function executeBugRepro(id: string): Promise<BugReproRun | null> {
  const db = await getCoreDb();
  const row = await db.get<Record<string, unknown>>(
    'SELECT * FROM bug_repro_runs WHERE id = ?',
    [id],
  );
  if (!row) return null;

  const code = row.code as string;
  const language = row.language as string;
  const runtime = (row.runtime as SandboxRuntime) ?? 'docker';

  await db.run('UPDATE bug_repro_runs SET status = ? WHERE id = ?', ['running', id]);

  let status: BugReproRun['status'];
  let stdout = '';
  let stderr = '';
  let exitCode = 1;
  let durationMs = 0;
  let passed = false;

  try {
    const result = await runInSandbox({ code, language, runtime });
    stdout = result.stdout;
    stderr = result.stderr;
    exitCode = result.exitCode;
    durationMs = result.durationMs;
    passed = result.exitCode === 0 && !result.timedOut;
    status = passed ? 'passed' : 'failed';
  } catch (e) {
    status = 'error';
    stderr = `Execution error: ${e instanceof Error ? e.message : String(e)}`;
  }

  await db.run(
    `UPDATE bug_repro_runs SET status = ?, stdout = ?, stderr = ?, exit_code = ?, duration_ms = ?, passed = ?, rounds = rounds + 1
     WHERE id = ?`,
    [status, stdout, stderr, exitCode, durationMs, passed ? 1 : 0, id],
  );

  return {
    id,
    issueTitle: row.issue_title as string,
    issueDescription: (row.issue_description as string) ?? '',
    language,
    code,
    testCode: (row.test_code as string) ?? '',
    runtime,
    status,
    result: {
      stdout,
      stderr,
      exitCode,
      durationMs,
      passed,
    },
    rounds: ((row.rounds as number) ?? 0) + 1,
    createdAt: row.created_at as string,
    sessionId: (row.session_id as string) ?? '',
    tags: JSON.parse((row.tags as string) ?? '[]'),
  };
}

export async function getBugRepro(id: string): Promise<BugReproRun | null> {
  const db = await getCoreDb();
  const row = await db.get<Record<string, unknown>>(
    'SELECT * FROM bug_repro_runs WHERE id = ?',
    [id],
  );
  if (!row) return null;

  return {
    id: row.id as string,
    issueTitle: row.issue_title as string,
    issueDescription: (row.issue_description as string) ?? '',
    language: row.language as string,
    code: row.code as string,
    testCode: (row.test_code as string) ?? '',
    runtime: (row.runtime as SandboxRuntime) ?? 'docker',
    status: (row.status as BugReproRun['status']) ?? 'queued',
    result: row.stdout !== undefined && row.stdout !== null ? {
      stdout: row.stdout as string,
      stderr: (row.stderr as string) ?? '',
      exitCode: (row.exit_code as number) ?? 1,
      durationMs: (row.duration_ms as number) ?? 0,
      passed: !!(row.passed as number),
    } : undefined,
    fixedCode: (row.fixed_code as string) ?? undefined,
    rounds: (row.rounds as number) ?? 0,
    createdAt: row.created_at as string,
    sessionId: (row.session_id as string) ?? '',
    tags: JSON.parse((row.tags as string) ?? '[]'),
  };
}

export async function listBugRepros(opts: {
  limit?: number;
  status?: string;
  sessionId?: string;
}): Promise<BugReproRun[]> {
  const db = await getCoreDb();
  let sql = 'SELECT id FROM bug_repro_runs WHERE 1=1';
  const args: Array<string | number> = [];

  if (opts.status) {
    sql += ' AND status = ?';
    args.push(opts.status);
  }
  if (opts.sessionId) {
    sql += ' AND session_id = ?';
    args.push(opts.sessionId);
  }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  args.push(opts.limit ?? 50);

  const rows = await db.all<{ id: string }>(sql, args);
  const runs: BugReproRun[] = [];
  for (const row of rows) {
    const run = await getBugRepro(row.id);
    if (run) runs.push(run);
  }
  return runs;
}

export async function deleteBugRepro(id: string): Promise<boolean> {
  try {
    const db = await getCoreDb();
    await db.run('DELETE FROM bug_repro_runs WHERE id = ?', [id]);
    return true;
  } catch {
    return false;
  }
}
