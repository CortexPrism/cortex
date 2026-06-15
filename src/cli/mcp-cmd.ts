import { Command } from '@cliffy/command';
import { bold, cyan } from '@std/fmt/colors';

const mcpCommand = new Command()
  .name('mcp')
  .description('Run Cortex as an MCP server (stdio or HTTP)')
  .action(async () => {
    console.log('');
    console.log(bold('Cortex MCP Server'));
    console.log('');
    console.log('Modes:');
    console.log(`  ${cyan('cortex mcp serve')}     — Start MCP server via HTTP (port 9187)`);
    console.log(`  ${cyan('cortex mcp stdio')}     — Start MCP server via stdio (for Claude Desktop, VS Code)`);
    console.log('');
  });

mcpCommand
  .command('serve')
  .description('Start MCP server in HTTP mode on port 9187')
  .action(async () => {
    console.log('MCP server mode active.');
    console.log('Use `cortex serve` to start the full server with MCP at /mcp');
    console.log('Or use `cortex mcp stdio` for Claude Desktop / VS Code integration.');
  });

mcpCommand
  .command('stdio')
  .description('Start MCP server in stdio mode (for Claude Desktop, VS Code)')
  .action(async () => {
    const { runMcpServerStdio } = await import('../mcp/server.ts');
    await runMcpServerStdio();
  });

export { mcpCommand };
