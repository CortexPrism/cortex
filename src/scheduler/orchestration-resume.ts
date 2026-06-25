import { getCoreDb } from '../db/client.ts';
import type { Db } from '../db/client.ts';
import { logger } from '../utils/logger.ts';
import {
  expelAllExpiredWaitBarriers,
  failStaleSubagentRuns,
  isTerminalStatus,
} from '../db/subagent-runs.ts';
import type { SubagentRunStatus } from '../db/subagent-runs.ts';

const _log = logger('orchestration-resume');

/** Max time a child sub-agent can be 'running' before being auto-failed (15 min). */
const STALE_CHILD_TIMEOUT_MS = 15 * 60 * 1000;
/** Barrier expiry threshold (30 min — matches the default in expelExpiredWaitBarriers). */
const BARRIER_EXPIRY_MINUTES = 30;

interface PendingBundle {
  id: string;
  session_id: string;
  turn_id: string;
  wait_barrier_id: string;
  run_ids_json: string;
  await_mode: string;
  barrier_label: string | null;
}

export async function checkPendingResumes(): Promise<number> {
  const db = await getCoreDb();

  await db.exec(`
    CREATE TABLE IF NOT EXISTS orchestration_resume_bundles (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      turn_id TEXT NOT NULL,
      wait_barrier_id TEXT NOT NULL,
      run_ids_json TEXT NOT NULL DEFAULT '[]',
      await_mode TEXT DEFAULT 'all',
      barrier_label TEXT,
      resume_via TEXT DEFAULT 'websocket',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'expired')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      delivered_at TEXT
    )
  `);

  // ── Housekeeping: expire stale barriers and failed children ──────────
  await expelAllExpiredWaitBarriers(BARRIER_EXPIRY_MINUTES);
  await failStaleSubagentRuns(STALE_CHILD_TIMEOUT_MS);

  // Expire any pending bundles whose associated wait barrier is no
  // longer active (expired or resolved without delivery).
  await db.run(
    `UPDATE orchestration_resume_bundles SET status = 'expired'
     WHERE status = 'pending'
       AND wait_barrier_id NOT IN (
         SELECT id FROM subagent_wait_barriers WHERE status = 'active'
       )`,
  );

  const bundles = await db.all<PendingBundle>(
    `SELECT * FROM orchestration_resume_bundles
     WHERE status = 'pending'
     ORDER BY created_at ASC
     LIMIT 50`,
  );

  if (bundles.length > 0) {
    _log.info(`Checking ${bundles.length} pending resume bundle(s)`, {
      bundles: bundles.map((b) => ({
        id: b.id,
        session: b.session_id,
        label: b.barrier_label,
        awaitMode: b.await_mode,
      })),
    });
  }

  let delivered = 0;

  for (const bundle of bundles) {
    let runIds: string[] = [];
    try {
      runIds = JSON.parse(bundle.run_ids_json);
    } catch {
      _log.warn(`Bundle has malformed run_ids_json, expiring`, { bundleId: bundle.id });
      await db.run(
        `UPDATE orchestration_resume_bundles SET status = 'expired' WHERE id = ?`,
        [bundle.id],
      );
      continue;
    }

    if (runIds.length === 0) {
      _log.warn(`Bundle has empty run_ids, expiring`, { bundleId: bundle.id });
      await db.run(
        `UPDATE orchestration_resume_bundles SET status = 'expired' WHERE id = ?`,
        [bundle.id],
      );
      continue;
    }

    // Inspect child statuses for observability BEFORE the terminal check
    const childStatuses: Array<{ runId: string; status: string }> = [];
    for (const runId of runIds) {
      const row = await db.get<{ status: string }>(
        `SELECT status FROM subagent_runs WHERE id = ?`,
        [runId],
      );
      childStatuses.push({ runId, status: row?.status ?? 'not_found' });
    }
    const terminalCount = childStatuses.filter((c) =>
      ['completed', 'failed', 'ready_for_apply', 'consumed', 'cancelled'].includes(c.status)
    ).length;

    const allTerminal = terminalCount === runIds.length;

    if (!allTerminal) {
      _log.debug(`Bundle not yet deliverable — children not all terminal`, {
        bundleId: bundle.id,
        sessionId: bundle.session_id,
        totalChildren: runIds.length,
        terminalCount,
        statuses: childStatuses.map((c) => `${c.runId.slice(-12)}:${c.status}`).join(', '),
      });
      continue;
    }

    try {
      const jobId = `orch-resume-${bundle.wait_barrier_id}`;

      await db.run(
        `INSERT INTO jobs (id, name, command, kind, schedule_kind, schedule_config, action_kind, action_config, status, created_at, next_run_at)
         VALUES (?, ?, ?, 'adhoc', 'adhoc', '{}', 'agent_turn', ?, 'pending', datetime('now'), datetime('now'))`,
        [
          jobId,
          `Orchestration resume: ${bundle.barrier_label || bundle.wait_barrier_id}`,
          `[Orchestration Resume] Resume for barrier ${bundle.wait_barrier_id}`,
          JSON.stringify({
            prompt: `[ORCHESTRATION RESUME]\nBarrier: ${
              bundle.barrier_label || bundle.wait_barrier_id
            }\nRun IDs: ${runIds.join(', ')}`,
            session_id: bundle.session_id,
            orchestrationResume: {
              waitBarrierId: bundle.wait_barrier_id,
              runIds,
              awaitMode: bundle.await_mode,
              barrierLabel: bundle.barrier_label,
            },
          }),
        ],
      );

      await db.run(
        `UPDATE orchestration_resume_bundles
         SET status = 'delivered', resume_via = 'scheduler', delivered_at = datetime('now')
         WHERE id = ?`,
        [bundle.id],
      );

      _log.info(`Delivered detached resume`, {
        bundleId: bundle.id,
        sessionId: bundle.session_id,
        waitBarrierId: bundle.wait_barrier_id,
        runCount: runIds.length,
      });
      delivered++;
    } catch (e) {
      _log.error(`Failed to deliver resume`, {
        bundleId: bundle.id,
        error: (e as Error).message,
      });
    }
  }

  if (delivered > 0) {
    _log.info(`Detached resume delivery complete`, { delivered });
  }

  return delivered;
}

async function checkAllChildrenTerminal(
  db: Awaited<ReturnType<typeof getCoreDb>>,
  runIds: string[],
): Promise<boolean> {
  for (const runId of runIds) {
    const row = await db.get<{ status: string }>(
      `SELECT status FROM subagent_runs WHERE id = ?`,
      [runId],
    );
    if (!row) return false;
    if (!(await isTerminalStatus(row.status as SubagentRunStatus))) return false;
  }
  return true;
}
