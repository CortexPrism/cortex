import { Command } from '@cliffy/command';
import { bold, cyan, dim, green, red, yellow } from '@std/fmt/colors';
import { countChildSessions, listSessions } from '../db/sessions.ts';
import { runMigrations } from '../db/migrate.ts';
import { i18n } from '../i18n/service.ts';

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

function channelLabel(ch: string): string {
  if (ch.startsWith('subagent:')) return ch.replace('subagent:', '');
  return ch;
}

function channelColor(ch: string): (s: string) => string {
  if (ch.startsWith('subagent')) return yellow;
  if (ch === 'web') return cyan;
  return dim;
}

export const sessionsCommand = new Command()
  .name('sessions')
  .description('List recent chat sessions')
  .option('-n, --limit <n:number>', 'Number of sessions to show', { default: 20 })
  .action(async (options: { limit: number }) => {
    await runMigrations();
    const sessions = await listSessions(options.limit);

    if (sessions.length === 0) {
      console.log(dim('\n  ' + i18n.t('cli.sessions.empty') + '\n'));
      return;
    }

    // Fetch child counts for all sessions in parallel
    const childCounts = new Map<string, number>();
    await Promise.all(
      sessions.map(async (s) => {
        const count = await countChildSessions(s.id);
        if (count > 0) childCounts.set(s.id, count);
      }),
    );

    console.log('');
    console.log(bold('  ' + i18n.t('cli.sessions.heading')));
    console.log(dim('  ─────────────────────────────────────────────────────'));

    for (const s of sessions) {
      const status = s.status === 'active' ? green('●') : dim('○');
      const turns = s.turn_count === 1
        ? i18n.t('cli.sessions.oneTurn')
        : i18n.t('cli.sessions.turnCount', { count: s.turn_count });
      const duration = formatDuration(s.started_at, s.closed_at);
      const date = formatDate(s.started_at);
      const name = s.name ?? s.id;

      const ch = channelLabel(s.channel);
      const chClr = channelColor(s.channel);
      const chBadge = s.channel !== 'cli' ? ` ${chClr(`[${ch}]`)}` : '';
      const childCount = childCounts.get(s.id);
      const childBadge = childCount
        ? yellow(
          ' ⤷ ' + (childCount > 1
            ? i18n.t('cli.sessions.subAgents', { count: childCount })
            : i18n.t('cli.sessions.subAgent', { count: childCount })),
        )
        : '';
      const parentBadge = s.parent_session_id
        ? dim(' ⤣ ' + i18n.t('cli.sessions.childOf') + ' ') + dim(s.parent_session_id.slice(-12))
        : '';

      console.log(
        `  ${status} ${bold(cyan(name))}${chBadge} ${
          dim(`· ${turns} · ${duration} · ${date}`)
        }${childBadge}${parentBadge}`,
      );

      if (s.status === 'closed' && s.closed_at) {
        // no-op, info already shown
      }
    }

    console.log('');

    const active = sessions.filter((s) => s.status === 'active');
    if (active.length > 0) {
      console.log(red('  ' + i18n.t('cli.sessions.stillActive', { count: active.length }) + '\n'));
    }
  });
