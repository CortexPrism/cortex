/**
 * cortex debug — live introspection and diagnostics.
 *
 * Usage:
 *   cortex debug sessions          List active sessions with metadata
 *   cortex debug session <id>      Inspect a single session (turns, messages, memory)
 *   cortex debug turn <turnId>     Full turn transcript (requires --session)
 *   cortex debug health            Expanded health check
 *   cortex debug metrics           Print current Prometheus metrics
 *   cortex debug memory            Memory stats (episodic, semantic)
 */
import { Command } from '@cliffy/command';
import { logger } from '../utils/logger.ts';
import { getCoreDb, getSessionDb, getMemoryDb } from '../db/client.ts';

const _log = logger('cli:debug');

export const debugCmd = new Command()
  .name('debug')
  .description('Live introspection and diagnostics')
  .action(function () {
    this.showHelp();
  });

debugCmd
  .command('sessions')
  .description('List active sessions with metadata')
  .action(async () => {
    try {
      const db = await getCoreDb();
      const sessions = await db.all<Record<string, unknown>>(
        `SELECT id, agent_id, status, created_at, updated_at, turn_count
         FROM sessions WHERE status = 'active'
         ORDER BY created_at DESC LIMIT 50`,
      );
      if (!sessions.length) {
        console.log('No active sessions.');
        return;
      }
      console.log(`Active sessions (${sessions.length}):`);
      for (const s of sessions) {
        const created = new Date(s.created_at as string).toISOString().split('T')[0];
        console.log(
          `  ${s.id}  agent=${s.agent_id ?? 'default'}  turns=${s.turn_count ?? 0}  created=${created}`,
        );
      }
    } catch (e) {
      console.error('Failed to list sessions:', (e as Error).message);
    }
  });

debugCmd
  .command('session')
  .arguments('<id:string>')
  .description('Inspect a single session')
  .action(async (_opts: void, id: string) => {
    try {
      const coreDb = await getCoreDb();
      const session = await coreDb.get<Record<string, unknown>>(
        `SELECT * FROM sessions WHERE id = ?`,
        [id],
      );
      if (!session) {
        console.error(`Session '${id}' not found.`);
        return;
      }
      console.log('Session:', JSON.stringify(session, null, 2));

      const sessDb = await getSessionDb(id);
      const messages = await sessDb.all<Record<string, unknown>>(
        `SELECT role, length(content) as len, token_count, created_at
         FROM session_messages ORDER BY id`,
      );
      console.log(`\nMessages (${messages.length}):`);
      for (const m of messages) {
        console.log(
          `  ${m.role}  ${m.len} chars  tokens=${m.token_count ?? '?'}  ${m.created_at}`,
        );
      }

      const events = await sessDb.all<Record<string, unknown>>(
        `SELECT event_type, created_at FROM session_events ORDER BY id DESC LIMIT 20`,
      );
      console.log(`\nRecent events (${events.length}):`);
      for (const e of events) {
        console.log(`  ${e.event_type}  ${e.created_at}`);
      }
    } catch (e) {
      console.error('Failed to inspect session:', (e as Error).message);
    }
  });

debugCmd
  .command('turn')
  .arguments('<turnId:string>')
  .option('-s, --session <id:string>', 'Session ID', { required: true })
  .description('Show full turn transcript')
  .action(async (opts: { session: string }, turnId: string) => {
    try {
      const sessionId = opts.session;
      const db = await getSessionDb(sessionId);
      const messages = await db.all<Record<string, unknown>>(
        `SELECT role, content, token_count, created_at FROM session_messages ORDER BY id`,
      );
      console.log(`Turn: ${turnId} (session: ${sessionId})`);
      console.log(`Messages: ${messages.length}`);
      for (const m of messages) {
        console.log(`\n[${m.role}] ${m.created_at} (tokens: ${m.token_count ?? '?'})`);
        console.log((m.content as string).slice(0, 500));
        if ((m.content as string).length > 500) console.log('...[truncated]');
      }
    } catch (e) {
      console.error('Failed to load turn:', (e as Error).message);
    }
  });

debugCmd
  .command('health')
  .description('Expanded health check')
  .action(async () => {
    const results: Record<string, string> = {};
    try {
      const db = await getCoreDb();
      await db.get('SELECT 1');
      results['core.db'] = 'OK';
    } catch (e) {
      results['core.db'] = `FAIL: ${(e as Error).message}`;
    }
    try {
      const memDb = await getMemoryDb();
      await memDb.get('SELECT 1');
      results['memory.db'] = 'OK';
    } catch (e) {
      results['memory.db'] = `FAIL: ${(e as Error).message}`;
    }
    try {
      const sysInfo = Deno.systemMemoryInfo();
      const freeGB = (sysInfo.free / (1024 ** 3)).toFixed(1);
      const totalGB = (sysInfo.total / (1024 ** 3)).toFixed(1);
      results['memory'] = `${freeGB} GB free / ${totalGB} GB total`;
    } catch (e) {
      results['memory'] = `FAIL: ${(e as Error).message}`;
    }
    try {
      const uptime = Math.floor(Deno.osUptime() / 3600);
      results['uptime'] = `${uptime}h`;
    } catch (e) {
      results['uptime'] = 'unknown';
    }
    console.log('Health:');
    for (const [key, val] of Object.entries(results)) {
      console.log(`  ${key}: ${val}`);
    }
  });

debugCmd
  .command('metrics')
  .description('Print current Prometheus metrics')
  .action(async () => {
    try {
      const { renderPrometheus } = await import('../observability/metrics.ts');
      console.log(renderPrometheus());
    } catch (e) {
      console.error('Failed to render metrics:', (e as Error).message);
    }
  });

debugCmd
  .command('memory')
  .description('Memory storage statistics')
  .action(async () => {
    try {
      const memDb = await getMemoryDb();
      const episodic = await memDb.all<{ count: number }>(
        `SELECT COUNT(*) as count FROM episodic_memory`,
      );
      const semantic = await memDb.all<{ count: number }>(
        `SELECT COUNT(*) as count FROM semantic_memory`,
      );
      console.log(`Episodic entries: ${episodic[0]?.count ?? 0}`);
      console.log(`Semantic entries: ${semantic[0]?.count ?? 0}`);
    } catch (e) {
      console.error('Failed to query memory:', (e as Error).message);
    }
  });
