import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { bold, cyan, green, red, yellow } from '@std/fmt/colors';
import { i18n } from '../i18n/service.ts';

export const memoriCommand = cortexCommand('memori')
  .description('Memori Persistent Checkpointing — agent state survival across restarts')
  .action(async (_opts: Record<string, unknown>, _ctx: Ctx) => {
    console.log('');
    console.log(bold('Cortex Memori Checkpoints'));
    console.log('');
    console.log(bold('Actions'));
    console.log(`  ${cyan('cortex memori list [sessionId]')}  — List checkpoints`);
    console.log(`  ${cyan('cortex memori prune <sessionId>')}  — Prune old checkpoints`);
    console.log('');
  })
  .command(
    'list',
    cortexCommand('list')
      .description('List checkpoints, optionally filtered by session')
      .arguments('[sessionId:string]')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx, sessionId?: string) => {
        const { getCoreDb } = await import('../db/client.ts');
        const { initCheckpointStore, listCheckpoints } = await import('../memori/mod.ts');

        const db = await getCoreDb();
        await initCheckpointStore(db);
        const checkpoints = await listCheckpoints(db, {
          sessionId,
          limit: 20,
        });

        console.log(bold(`\nMemori Checkpoints${sessionId ? ` (Session: ${sessionId})` : ''}`));
        console.log(`Found ${checkpoints.length} checkpoint(s)\n`);

        for (const cp of checkpoints) {
          const time = new Date(cp.timestamp).toLocaleString();
          console.log(`  ${cyan(`Turn ${cp.turnNumber}`)} — ${time}`);
          console.log(`    Session: ${cp.sessionId}`);
          console.log(
            `    Messages: ${cp.messageCount} | Tool calls: ${cp.toolCallCount} | Tokens: ${cp.tokensUsed}`,
          );
          if (cp.goalSnapshot) console.log(`    Goal: ${cp.goalSnapshot}`);
          console.log('');
        }
      }),
  )
  .command(
    'prune',
    cortexCommand('prune')
      .description('Prune old checkpoints, keeping only the most recent N')
      .arguments('<sessionId:string>')
      .option('-k, --keep <keep:number>', 'Number of checkpoints to keep', { default: 5 })
      .action(async (opts: Record<string, unknown>, _ctx: Ctx, sessionId?: string) => {
        if (!sessionId) {
          console.error(red(i18n.t('cli.memori.sessionIdRequired')));
          Deno.exit(1);
        }

        const { getCoreDb } = await import('../db/client.ts');
        const { initCheckpointStore, pruneOldCheckpoints } = await import('../memori/mod.ts');

        const db = await getCoreDb();
        await initCheckpointStore(db);
        const keep = opts.keep as number;
        const removed = await pruneOldCheckpoints(db, sessionId, keep);

        console.log(
          green(i18n.t('cli.memori.prunedCheckpoints', { removed: String(removed), sessionId })),
        );
        console.log(i18n.t('cli.memori.keptRecent', { keep: String(keep) }));
      }),
  );
