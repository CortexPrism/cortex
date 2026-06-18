import { Command } from '@cliffy/command';
import { bold, cyan, green, red, yellow } from '@std/fmt/colors';

const mcpCommand = new Command()
  .name('mcp')
  .description('MCP server and client — run as server, or connect to external agents')
  .action(async () => {
    console.log('');
    console.log(bold('Cortex MCP'));
    console.log('');
    console.log(bold('Server'));
    console.log(`  ${cyan('cortex mcp serve')}          — Start MCP server via HTTP (port 9187)`);
    console.log(
      `  ${
        cyan('cortex mcp stdio')
      }          — Start MCP server via stdio (for Claude Desktop, VS Code)`,
    );
    console.log('');
    console.log(bold('Client (connect to external agents)'));
    console.log(
      `  ${cyan('cortex mcp connect <name>')} — Connect to an external MCP agent`,
    );
    console.log(
      `  ${cyan('cortex mcp disconnect <name>')} — Disconnect from an MCP agent`,
    );
    console.log(
      `  ${cyan('cortex mcp connections')}   — List all connected MCP servers`,
    );
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

mcpCommand
  .command('connect <name:string>')
  .description('Connect to an external MCP-compatible coding agent')
  .option('--command <cmd:string>', 'Command to spawn the agent (stdio transport)')
  .option('--args <args:string>', 'Comma-separated arguments for the command')
  .option('--url <url:string>', 'HTTP URL of the MCP server (HTTP transport)')
  .option('--env <env:string>', 'Comma-separated KEY=VAL environment variables')
  .action(
    async (
      options: { url?: string; command?: string; args?: string; env?: string },
      name: string,
    ) => {
      const { connectHttp, connectStdio } = await import('../mcp/client.ts');

      if (options.url) {
        console.log(`Connecting to ${green(name)} via HTTP at ${cyan(options.url)}...`);
        try {
          const conn = await connectHttp({ name, transport: 'http', url: options.url });
          console.log(green('Connected!'));
          console.log(
            `  Server: ${conn.serverInfo?.name ?? 'unknown'} v${conn.serverInfo?.version ?? '?'}`,
          );
          console.log(`  Tools: ${conn.tools.length}`);
          for (const t of conn.tools) {
            console.log(`    ${yellow(t.name)} — ${t.description}`);
          }
        } catch (e) {
          console.error(red(`Failed to connect: ${(e as Error).message}`));
        }
      } else if (options.command) {
        const args = options.args
          ? String(options.args).split(',').map((s: string) => s.trim()).filter(Boolean)
          : [];
        const env: Record<string, string> = {};
        if (options.env) {
          for (const pair of String(options.env).split(',')) {
            const [key, ...rest] = pair.trim().split('=');
            if (key) env[key] = rest.join('=');
          }
        }

        console.log(
          `Connecting to ${green(name)} via stdio: ${
            cyan(options.command + ' ' + args.join(' '))
          }...`,
        );
        try {
          const conn = await connectStdio({
            name,
            transport: 'stdio',
            command: options.command,
            args,
            env,
          });
          console.log(green('Connected!'));
          console.log(
            `  Server: ${conn.serverInfo?.name ?? 'unknown'} v${conn.serverInfo?.version ?? '?'}`,
          );
          console.log(`  Tools: ${conn.tools.length}`);
          for (const t of conn.tools) {
            console.log(`    ${yellow(t.name)} — ${t.description}`);
          }
        } catch (e) {
          console.error(red(`Failed to connect: ${(e as Error).message}`));
        }
      } else {
        console.error(red('Specify --command (stdio) or --url (HTTP)'));
      }
    },
  );

mcpCommand
  .command('disconnect <name:string>')
  .description('Disconnect from a connected MCP agent')
  .action(async (_opts: void, name: string) => {
    const { disconnectHttp, disconnectStdio, getConnection } = await import('../mcp/client.ts');
    const conn = getConnection(name);
    if (!conn) {
      console.error(red(`No MCP connection named "${name}"`));
      return;
    }
    if (conn.config.transport === 'http') {
      await disconnectHttp(name);
    } else {
      await disconnectStdio(name);
    }
    console.log(green(`Disconnected from "${name}"`));
  });

mcpCommand
  .command('connections')
  .description('List all connected MCP servers and their tools')
  .action(async () => {
    const { listConnections } = await import('../mcp/client.ts');
    const connections = listConnections();

    if (!connections.length) {
      console.log(yellow('No MCP servers are currently connected.'));
      console.log('');
      console.log('Connect options:');
      console.log(`  ${cyan('cortex mcp connect <name> --command "kilocode mcp"')}`);
      console.log(`  ${cyan('cortex mcp connect <name> --url http://localhost:9187/mcp')}`);
      return;
    }

    console.log('');
    console.log(bold('Connected MCP Servers'));
    console.log('');

    for (const conn of connections) {
      const status = conn.connected ? green('connected') : red('disconnected');
      const info = conn.serverInfo
        ? `${conn.serverInfo.name} v${conn.serverInfo.version}`
        : 'unknown';
      console.log(`  ${bold(conn.config.name)} (${conn.config.transport}, ${status}) — ${info}`);
      console.log(`    Calls: ${conn.calls}, Errors: ${conn.errors}`);
      console.log(`    Since: ${conn.createdAt.toISOString()}`);
      console.log(`    Tools (${conn.tools.length}):`);
      for (const t of conn.tools) {
        console.log(`      ${yellow(t.name)} — ${t.description}`);
      }
      console.log('');
    }
  });

export { mcpCommand };
