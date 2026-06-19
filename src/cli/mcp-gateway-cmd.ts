import { Command } from '@cliffy/command';
import { bold, cyan, green, red, yellow } from '@std/fmt/colors';
import { loadConfig } from '../config/config.ts';

export const mcpGatewayCommand = new Command()
  .name('mcp-gateway')
  .description('MCP Gateway — enterprise MCP server management')
  .action(async () => {
    console.log('');
    console.log(bold('Cortex MCP Gateway'));
    console.log('');
    console.log(bold('Actions'));
    console.log(`  ${cyan('cortex mcp-gateway status')}  — Show managed servers and health`);
    console.log(`  ${cyan('cortex mcp-gateway health')}  — Run health checks on all servers`);
    console.log('');
  });

mcpGatewayCommand
  .command('status')
  .description('Show managed MCP servers and their health status')
  .action(async () => {
    const { listServers, getHealthyServers, getDegradedServers, getServerCount } = await import(
      '../mcp-gateway/mod.ts'
    );

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
      console.log(yellow('  No managed MCP servers. Add connections via `cortex mcp`.'));
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
  });

mcpGatewayCommand
  .command('health')
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
      console.log(`  ${bold(server.name)}: ${statusColor(result.status)} (${result.latencyMs}ms)`);
      if (result.error) console.log(`    Error: ${result.error}`);
      if (result.status !== server.status) {
        updateServer(server.id, { status: result.status, lastHealthCheck: result.checkedAt });
      }
    }

    console.log('');
  });
