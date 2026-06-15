import { Command } from '@cliffy/command';
import { listChannels, startChannel, stopChannel } from '../channels/manager.ts';
import { green, yellow } from '@std/fmt/colors';

const channelsCommand = new Command()
  .name('channels')
  .description('Manage communication channels (Discord, Signal, Telegram, etc.)')
  .action(() => {
    const chans = listChannels();
    if (chans.length === 0) {
      console.log('No channels registered.');
      console.log('Channels are loaded via plugins. Install a channel plugin first.');
      return;
    }
    console.log(`\n${chans.length} channel(s) registered:\n`);
    for (const c of chans) {
      const status = c.enabled ? green('active') : yellow('disabled');
      console.log(`  ${c.id} (${c.protocol}) — ${status} → agent:${c.agentId}`);
    }
    console.log();
  });

channelsCommand
  .command('start <id:string>')
  .description('Start a channel')
  .action(async (_opts: void, id: string) => {
    try {
      await startChannel(id);
      console.log(green(`Channel "${id}" started.`));
    } catch (e) {
      console.error(`Failed to start channel: ${(e as Error).message}`);
    }
  });

channelsCommand
  .command('stop <id:string>')
  .description('Stop a channel')
  .action(async (_opts: void, id: string) => {
    try {
      await stopChannel(id);
      console.log(`Channel "${id}" stopped.`);
    } catch (e) {
      console.error(`Failed to stop channel: ${(e as Error).message}`);
    }
  });

export { channelsCommand };
