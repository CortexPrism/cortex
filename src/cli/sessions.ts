import { Command } from '@cliffy/command';
import { bold, cyan, dim, green, red } from '@std/fmt/colors';
import { listSessions } from '../db/sessions.ts';
import { runMigrations } from '../db/migrate.ts';

function formatDuration(startedAt: string, closedAt: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = closedAt ? new Date(closedAt).getTime() : Date.now();
  const ms = end - start;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${Math.round(ms / 3600000)}h`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export const sessionsCommand = new Command()
  .name('sessions')
  .description('List recent chat sessions')
  .option('-n, --limit <n:number>', 'Number of sessions to show', { default: 20 })
  .action(async (options: { limit: number }) => {
    await runMigrations();
    const sessions = await listSessions(options.limit);

    if (sessions.length === 0) {
      console.log(dim('\n  No sessions yet. Run `cortex chat` to start one.\n'));
      return;
    }

    console.log('');
    console.log(bold('  Recent Sessions'));
    console.log(dim('  ─────────────────────────────────────────────────────'));

    for (const s of sessions) {
      const status = s.status === 'active' ? green('●') : dim('○');
      const turns = s.turn_count === 1 ? '1 turn' : `${s.turn_count} turns`;
      const duration = formatDuration(s.started_at, s.closed_at);
      const date = formatDate(s.started_at);
      const name = s.name ?? s.id;

      console.log(
        `  ${status} ${bold(cyan(name))} ${dim(`· ${turns} · ${duration} · ${date}`)}`,
      );

      if (s.status === 'closed' && s.closed_at) {
        // no-op, info already shown
      }
    }

    console.log('');

    const active = sessions.filter((s) => s.status === 'active');
    if (active.length > 0) {
      console.log(red(`  ${active.length} session(s) still active (process may have crashed)\n`));
    }
  });
