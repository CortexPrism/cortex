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
  .option('-p, --port <port:number>', 'Port to listen on', { default: 9187 })
  .option('-H, --host <host:string>', 'Host to bind to', { default: '127.0.0.1' })
  .action(async (opts: { port: number; host: string }) => {
    const { handleMcpHttpRequest } = await import('../mcp/server.ts');
    console.log(cyan(`  Starting MCP HTTP server on http://${opts.host}:${opts.port}/mcp`));
    console.log(green('  Ready for MCP connections. Press Ctrl+C to stop.\n'));
    await Deno.serve({ port: opts.port, hostname: opts.host }, async (req) => {
      const res = await handleMcpHttpRequest(req);
      return res ?? new Response('Not Found', { status: 404 });
    }).finished;
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

mcpCommand
  .command(
    'gateway',
    new Command()
      .name('gateway')
      .description('Manage enterprise MCP gateway servers')
      .action(async () => {
        console.log('');
        console.log(bold('Cortex MCP Gateway'));
        console.log('');
        console.log(bold('Actions'));
        console.log(`  ${cyan('cortex mcp gateway status')}  — Show managed servers and health`);
        console.log(`  ${cyan('cortex mcp gateway health')}  — Run health checks on all servers`);
        console.log('');
      })
      .command(
        'status',
        new Command()
          .description('Show managed MCP servers and their health status')
          .action(async () => {
            const { listServers, getHealthyServers, getDegradedServers, getServerCount } =
              await import('../mcp-gateway/mod.ts');
            const servers = listServers();
            const healthy = getHealthyServers();
            const degraded = getDegradedServers();
            console.log(bold('\nMCP Gateway Status'));
            console.log(
              `Total: ${getServerCount()} | ${green(`Healthy: ${healthy.length}`)} | ${
                degraded.length > 0 ? red(`Degraded: ${degraded.length}`) : `Degraded: 0`
              }`,
            );
            console.log('');
            if (servers.length === 0) {
              console.log(
                yellow('  No managed MCP servers. Add connections via `cortex mcp connect`.'),
              );
              console.log('');
              return;
            }
            for (const server of servers) {
              const statusColor = server.status === 'healthy'
                ? green
                : server.status === 'degraded'
                ? yellow
                : red;
              console.log(`  ${bold(server.name)} (${server.id})`);
              console.log(
                `    Status: ${
                  statusColor(server.status)
                } | Transport: ${server.transport} | Tools: ${server.toolCount}`,
              );
              console.log(`    Endpoint: ${server.endpoint}`);
              if (server.lastHealthCheck) {
                console.log(`    Last check: ${new Date(server.lastHealthCheck).toLocaleString()}`);
              }
              console.log('');
            }
          }),
      )
      .command(
        'health',
        new Command()
          .description('Run health checks on all managed MCP servers')
          .action(async () => {
            const { listServers, updateServer } = await import('../mcp-gateway/mod.ts');
            const { healthCheck } = await import('../mcp-gateway/gateway.ts');
            const servers = listServers();
            if (servers.length === 0) {
              console.log(yellow('\nNo managed MCP servers to check.'));
              return;
            }
            console.log(bold(`\nRunning health checks on ${servers.length} server(s)...\n`));
            for (const server of servers) {
              const result = await healthCheck(server);
              const statusColor = result.status === 'healthy'
                ? green
                : result.status === 'degraded'
                ? yellow
                : red;
              console.log(
                `  ${bold(server.name)}: ${statusColor(result.status)} (${result.latencyMs}ms)`,
              );
              if (result.error) console.log(`    Error: ${result.error}`);
              if (result.status !== server.status) {
                updateServer(server.id, {
                  status: result.status,
                  lastHealthCheck: result.checkedAt,
                });
              }
            }
            console.log('');
          }),
      ),
  );

export { mcpCommand };
