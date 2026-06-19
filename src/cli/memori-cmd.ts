import { Command } from '@cliffy/command';
import { bold, cyan, green, red, yellow } from '@std/fmt/colors';
import { loadConfig } from '../config/config.ts';

export const memoriCommand = new Command()
  .name('memori')
  .description('Memori Persistent Checkpointing — agent state survival across restarts')
  .action(async () => {
    console.log('');
    console.log(bold('Cortex Memori Checkpoints'));
    console.log('');
    console.log(bold('Actions'));
    console.log(`  ${cyan('cortex memori list [sessionId]')}  — List checkpoints`);
    console.log(`  ${cyan('cortex memori prune <sessionId>')}  — Prune old checkpoints`);
    console.log('');
  });

memoriCommand
  .command('list [sessionId:string]')
  .description('List checkpoints, optionally filtered by session')
  .action(async (_: unknown, sessionId?: string) => {
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
      console.log(`    Messages: ${cp.messageCount} | Tool calls: ${cp.toolCallCount} | Tokens: ${cp.tokensUsed}`);
      if (cp.goalSnapshot) console.log(`    Goal: ${cp.goalSnapshot}`);
      console.log('');
    }
  });

memoriCommand
  .command('prune <sessionId:string>')
  .description('Prune old checkpoints, keeping only the most recent N')
  .option('-k, --keep <keep:number>', 'Number of checkpoints to keep', { default: 5 })
  .action(async ({ keep }: { keep: number }, sessionId?: string) => {
    if (!sessionId) {
      console.error(red('Session ID is required'));
      Deno.exit(1);
    }

    const { getCoreDb } = await import('../db/client.ts');
    const { initCheckpointStore, pruneOldCheckpoints } = await import('../memori/mod.ts');

    const db = await getCoreDb();
    await initCheckpointStore(db);
    const removed = await pruneOldCheckpoints(db, sessionId, keep);

    console.log(green(`\nPruned ${removed} old checkpoint(s) from session ${sessionId}`));
    console.log(`Kept the most recent ${keep} checkpoint(s)\n`);
  });
