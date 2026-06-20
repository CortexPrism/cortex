import { Command } from '@cliffy/command';
import { bold, cyan, dim, yellow } from '@std/fmt/colors';

const remoteCommand = new Command()
  .name('remote')
  .description('(Deprecated) Use `cortex node` to manage remote Cortex nodes')
  .action(() => {
    console.log('');
    console.log(yellow('  ⚠  cortex remote is deprecated.'));
    console.log('');
    console.log('  Use the node system instead, which adds tier and group support:');
    console.log('');
    console.log(`  ${bold('Register a node:')}  ${cyan('cortex node register')}`);
    console.log(`  ${bold('List nodes:')}       ${cyan('cortex node')}`);
    console.log(`  ${bold('Connect a node:')}   ${cyan('cortex node connect')}`);
    console.log(`  ${bold('Deregister:')}       ${cyan('cortex node deregister <id>')}`);
    console.log('');
    console.log(
      dim('  cortex node supports capability tiers (root/sudo/unprivileged) and groups.'),
    );
    console.log('');
  });

export { remoteCommand };
