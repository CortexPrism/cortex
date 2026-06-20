import { Command } from '@cliffy/command';
import { bold, cyan, dim, yellow } from '@std/fmt/colors';
import { i18n } from '../i18n/service.ts';

const remoteCommand = new Command()
  .name('remote')
  .description('(Deprecated) Use `cortex node` to manage remote Cortex nodes')
  .action(() => {
    console.log('');
    console.log(yellow(i18n.t('cli.remote.deprecated')));
    console.log('');
    console.log(i18n.t('cli.remote.useNodeSystem'));
    console.log('');
    console.log(
      i18n.t('cli.remote.registerNodeHint', {
        bold: bold('Register a node:'),
        command: cyan('cortex node register'),
      }),
    );
    console.log(
      i18n.t('cli.remote.listNodesHint', {
        bold: bold('List nodes:'),
        command: cyan('cortex node'),
      }),
    );
    console.log(
      i18n.t('cli.remote.connectNodeHint', {
        bold: bold('Connect a node:'),
        command: cyan('cortex node connect'),
      }),
    );
    console.log(
      i18n.t('cli.remote.deregisterHint', {
        bold: bold('Deregister:'),
        command: cyan('cortex node deregister <id>'),
      }),
    );
    console.log('');
    console.log(dim(i18n.t('cli.remote.nodeSupports')));
    console.log('');
  });

export { remoteCommand };
