import { Command } from '@cliffy/command';
import { bold, cyan, dim, yellow } from '@std/fmt/colors';
import { i18n } from '../i18n/service.ts';

export const discordCommand = new Command()
  .name('discord')
  .description('(Deprecated) Use `cortex channels` to manage Discord connections')
  .option('-t, --token <token:string>', 'Discord bot token')
  .option('--prefix <prefix:string>', 'Command prefix', { default: '!cortex' })
  .option('-m, --model <model:string>', 'Override model for this session')
  .action(() => {
    console.log('');
    console.log(yellow(i18n.t('cli.discord.deprecated')));
    console.log('');
    console.log(i18n.t('cli.discord.useChannels'));
    console.log('');
    console.log(i18n.t('cli.discord.step1Add', { step: bold('1.') }));
    console.log(
      i18n.t('cli.discord.commandHint', { command: cyan('cortex channels add --type discord') }),
    );
    console.log('');
    console.log(i18n.t('cli.discord.step2Start', { step: bold('2.') }));
    console.log(i18n.t('cli.discord.commandHint', { command: cyan('cortex channels start <id>') }));
    console.log('');
    console.log(i18n.t('cli.discord.step3Manage', { step: bold('3.') }));
    console.log(i18n.t('cli.discord.commandHint', { command: cyan('cortex channels') }));
    console.log('');
    console.log(dim(i18n.t('cli.discord.channelsSupports')));
    console.log('');
  });
