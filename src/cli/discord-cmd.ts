import { Command } from '@cliffy/command';
import { bold, cyan, dim, yellow } from '@std/fmt/colors';

export const discordCommand = new Command()
  .name('discord')
  .description('(Deprecated) Use `cortex channels` to manage Discord connections')
  .option('-t, --token <token:string>', 'Discord bot token')
  .option('--prefix <prefix:string>', 'Command prefix', { default: '!cortex' })
  .option('-m, --model <model:string>', 'Override model for this session')
  .action(() => {
    console.log('');
    console.log(yellow('  ⚠  cortex discord is deprecated.'));
    console.log('');
    console.log('  Use the channels system instead:');
    console.log('');
    console.log(`  ${bold('1.')} Add a Discord channel:`);
    console.log(`     ${cyan('cortex channels add --type discord')}`);
    console.log('');
    console.log(`  ${bold('2.')} Start the channel:`);
    console.log(`     ${cyan('cortex channels start <id>')}`);
    console.log('');
    console.log(`  ${bold('3.')} Manage channels:`);
    console.log(`     ${cyan('cortex channels')}`);
    console.log('');
    console.log(dim('  The channels system supports Discord, Slack, Telegram, Teams, and more.'));
    console.log('');
  });
