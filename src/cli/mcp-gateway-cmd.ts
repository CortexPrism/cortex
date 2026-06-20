import { Command } from '@cliffy/command';
import { bold, cyan, yellow } from '@std/fmt/colors';

export const mcpGatewayCommand = new Command()
  .name('mcp-gateway')
  .description('(Deprecated) Use `cortex mcp gateway` instead')
  .action(() => {
    console.log('');
    console.log(yellow('  ⚠  cortex mcp-gateway is deprecated.'));
    console.log('');
    console.log('  Gateway management has moved under the mcp command:');
    console.log('');
    console.log(`  ${bold('Status:')}  ${cyan('cortex mcp gateway status')}`);
    console.log(`  ${bold('Health:')}  ${cyan('cortex mcp gateway health')}`);
    console.log('');
  });
