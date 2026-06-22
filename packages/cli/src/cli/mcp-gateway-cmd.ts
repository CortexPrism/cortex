import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { bold, cyan, yellow } from '@std/fmt/colors';
import { i18n } from '../../../../src/i18n/service.ts';

export const mcpGatewayCommand = cortexCommand('mcp-gateway')
  .description('(Deprecated) Use `cortex mcp gateway` instead')
  .action(async (_opts: Record<string, unknown>, _ctx: Ctx) => {
    console.log('');
    console.log(yellow(i18n.t('cli.mcp_gateway.deprecated')));
    console.log('');
    console.log(i18n.t('cli.mcp_gateway.gatewayMoved'));
    console.log('');
    console.log(
      i18n.t('cli.mcp_gateway.statusHint', {
        bold: bold('Status:'),
        command: cyan('cortex mcp gateway status'),
      }),
    );
    console.log(
      i18n.t('cli.mcp_gateway.healthHint', {
        bold: bold('Health:'),
        command: cyan('cortex mcp gateway health'),
      }),
    );
    console.log('');
  });
