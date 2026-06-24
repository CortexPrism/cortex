import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { bold, cyan, green, red, yellow } from '@std/fmt/colors';
import { i18n } from '../../../../src/i18n/service.ts';

const mcpCommand = cortexCommand('mcp')
  .description('MCP server and client — run as server, or connect to external agents')
  .action(async (_opts: Record<string, unknown>, _ctx: Ctx) => {
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
  .command(
    'serve',
    cortexCommand('serve')
      .description('Start MCP server in HTTP mode on port 9187')
      .option('-p, --port <port:number>', 'Port to listen on', { default: 9187 })
      .option('-H, --host <host:string>', 'Host to bind to', { default: '127.0.0.1' })
      .action(async (opts: Record<string, unknown>, _ctx: Ctx) => {
        const { handleMcpHttpRequest } = await import('../../../../src/mcp/server.ts');
        console.log(
          cyan(
            i18n.t('cli.mcp.startingHttpServer', {
              host: opts.host as string,
              port: String(opts.port as number),
            }),
          ),
        );
        console.log(green(i18n.t('cli.mcp.readyForMcp')));
        await Deno.serve(
          { port: opts.port as number, hostname: opts.host as string },
          async (req) => {
            const res = await handleMcpHttpRequest(req);
            return res ?? new Response('Not Found', { status: 404 });
          },
        ).finished;
      }),
  );

mcpCommand
  .command(
    'stdio',
    cortexCommand('stdio')
      .description('Start MCP server in stdio mode (for Claude Desktop, VS Code)')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx) => {
        const { runMcpServerStdio } = await import('../../../../src/mcp/server.ts');
        await runMcpServerStdio();
      }),
  );

mcpCommand
  .command(
    'connect <name:string>',
    cortexCommand('connect')
      .arguments('<name:string>')
      .description('Connect to an external MCP-compatible coding agent')
      .option('--command <cmd:string>', 'Command to spawn the agent (stdio transport)')
      .option('--args <args:string>', 'Comma-separated arguments for the command')
      .option('--url <url:string>', 'HTTP URL of the MCP server (HTTP transport)')
      .option('--env <env:string>', 'Comma-separated KEY=VAL environment variables')
      .action(
        async (opts: Record<string, unknown>, _ctx: Ctx, name: string) => {
          const { connectHttp, connectStdio } = await import('../../../../src/mcp/client.ts');

          if (opts.url) {
            console.log(
              i18n.t('cli.mcp.connectingHttp', {
                name: green(name),
                url: cyan(opts.url as string),
              }),
            );
            try {
              const conn = await connectHttp({ name, transport: 'http', url: opts.url as string });
              console.log(green(i18n.t('cli.mcp.connected')));
              console.log(
                i18n.t('cli.mcp.serverInfo', {
                  serverName: conn.serverInfo?.name ?? 'unknown',
                  serverVersion: conn.serverInfo?.version ?? '?',
                }),
              );
              console.log(i18n.t('cli.mcp.toolsCount', { count: String(conn.tools.length) }));
              for (const t of conn.tools) {
                console.log(`    ${yellow(t.name)} — ${t.description}`);
              }
            } catch (e) {
              console.error(
                red(i18n.t('cli.mcp.failedToConnect', { message: (e as Error).message })),
              );
            }
          } else if (opts.command) {
            const args = opts.args
              ? String(opts.args).split(',').map((s: string) => s.trim()).filter(Boolean)
              : [];
            const env: Record<string, string> = {};
            if (opts.env) {
              for (const pair of String(opts.env).split(',')) {
                const [key, ...rest] = pair.trim().split('=');
                if (key) env[key] = rest.join('=');
              }
            }

            console.log(
              i18n.t('cli.mcp.connectingStdio', {
                name: green(name),
                command: cyan(opts.command as string + ' ' + args.join(' ')),
              }),
            );
            try {
              const conn = await connectStdio({
                name,
                transport: 'stdio',
                command: opts.command as string,
                args,
                env,
              });
              console.log(green(i18n.t('cli.mcp.connected')));
              console.log(
                i18n.t('cli.mcp.serverInfo', {
                  serverName: conn.serverInfo?.name ?? 'unknown',
                  serverVersion: conn.serverInfo?.version ?? '?',
                }),
              );
              console.log(i18n.t('cli.mcp.toolsCount', { count: String(conn.tools.length) }));
              for (const t of conn.tools) {
                console.log(`    ${yellow(t.name)} — ${t.description}`);
              }
            } catch (e) {
              console.error(
                red(i18n.t('cli.mcp.failedToConnect', { message: (e as Error).message })),
              );
            }
          } else {
            console.error(red(i18n.t('cli.mcp.specifyTransport')));
          }
        },
      ),
  );

mcpCommand
  .command(
    'disconnect <name:string>',
    cortexCommand('disconnect')
      .arguments('<name:string>')
      .description('Disconnect from a connected MCP agent')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx, name: string) => {
        const { disconnectHttp, disconnectStdio, getConnection } = await import(
          '../../../../src/mcp/client.ts'
        );
        const conn = getConnection(name);
        if (!conn) {
          console.error(red(i18n.t('cli.mcp.noConnectionNamed', { name })));
          return;
        }
        if (conn.config.transport === 'http') {
          await disconnectHttp(name);
        } else {
          await disconnectStdio(name);
        }
        console.log(green(i18n.t('cli.mcp.disconnectedFrom', { name })));
      }),
  );

mcpCommand
  .command(
    'connections',
    cortexCommand('connections')
      .description('List all connected MCP servers and their tools')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx) => {
        const { listConnections } = await import('../../../../src/mcp/client.ts');
        const connections = listConnections();

        if (!connections.length) {
          console.log(yellow(i18n.t('cli.mcp.noMcpServers')));
          console.log('');
          console.log(i18n.t('cli.mcp.connectOptions'));
          console.log(i18n.t('cli.mcp.connectStdioHint'));
          console.log(i18n.t('cli.mcp.connectHttpHint'));
          return;
        }

        console.log('');
        console.log(bold(i18n.t('cli.mcp.connectedMcpServers')));
        console.log('');

        for (const conn of connections) {
          const status = conn.connected ? green('connected') : red('disconnected');
          const info = conn.serverInfo
            ? `${conn.serverInfo.name} v${conn.serverInfo.version}`
            : 'unknown';
          console.log(
            `  ${bold(conn.config.name)} (${conn.config.transport}, ${status}) — ${info}`,
          );
          console.log(`    Calls: ${conn.calls}, Errors: ${conn.errors}`);
          console.log(`    Since: ${conn.createdAt.toISOString()}`);
          console.log(`    Tools (${conn.tools.length}):`);
          for (const t of conn.tools) {
            console.log(`      ${yellow(t.name)} — ${t.description}`);
          }
          console.log('');
        }
      }),
  );

mcpCommand
  .command(
    'gateway',
    cortexCommand('gateway')
      .description('Manage enterprise MCP gateway servers')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx) => {
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
        cortexCommand('status')
          .description('Show managed MCP servers and their health status')
          .action(async (_opts: Record<string, unknown>, _ctx: Ctx) => {
            const { listServers, getHealthyServers, getDegradedServers, getServerCount } =
              await import('../../../../src/mcp-gateway/mod.ts');
            const servers = await listServers();
            const healthy = await getHealthyServers();
            const degraded = await getDegradedServers();
            console.log(bold('\nMCP Gateway Status'));
            console.log(
              `Total: ${await getServerCount()} | ${green(`Healthy: ${healthy.length}`)} | ${
                degraded.length > 0 ? red(`Degraded: ${degraded.length}`) : `Degraded: 0`
              }`,
            );
            console.log('');
            if (servers.length === 0) {
              console.log(
                yellow(i18n.t('cli.mcp.noManagedServers')),
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
        cortexCommand('health')
          .description('Run health checks on all managed MCP servers')
          .action(async (_opts: Record<string, unknown>, _ctx: Ctx) => {
            const { listServers, updateServer } = await import(
              '../../../../src/mcp-gateway/mod.ts'
            );
            const { healthCheck } = await import('../../../../src/mcp-gateway/gateway.ts');
            const servers = await listServers();
            if (servers.length === 0) {
              console.log(yellow(i18n.t('cli.mcp.noManagedServersCheck')));
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
                await updateServer(server.id, {
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
