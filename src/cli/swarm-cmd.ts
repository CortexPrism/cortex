/**
 * Cortex Swarm CLI — Distributed agent swarm management.
 */
import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { Input, Select } from '@cliffy/prompt';
import { bold, cyan, green, red, yellow } from '@std/fmt/colors';
import { i18n } from '../i18n/service.ts';

const swarmCommand = cortexCommand('swarm')
  .description('Manage distributed agent swarm')
  .action(async () => {
    console.log('');
    console.log(bold('CortexPrism Distributed Agent Swarm'));
    console.log('  Cross-instance coordination via A2A protocol.');
    console.log('');
    console.log('Commands:');
    console.log(`  ${cyan('cortex swarm init')}      Initialize this instance as a swarm node`);
    console.log(`  ${cyan('cortex swarm nodes')}     List connected swarm nodes`);
    console.log(`  ${cyan('cortex swarm topology')}  Show process tree across nodes`);
    console.log(`  ${cyan('cortex swarm report')}    Aggregated resource report`);
    console.log(`  ${cyan('cortex swarm drain')}     Drain this node (stop accepting work)`);
    console.log(`  ${cyan('cortex swarm seal')}      Seal this node (graceful shutdown)`);
    console.log('');
    console.log('Configuration:');
    console.log(`  Add seed nodes in ${yellow('~/.cortex/config.json')}:`);
    console.log(`  {`);
    console.log(`    "swarm": {`);
    console.log(`      "seedNodes": ["http://node2:4220/a2a", "http://node3:4220/a2a"],`);
    console.log(`      "group": "production",`);
    console.log(`      "enabled": true`);
    console.log(`    }`);
    console.log(`  }`);
    console.log('');
  });

swarmCommand
  .command(
    'init',
    cortexCommand('init')
      .description('Initialize this instance as a swarm node')
      .option('--name <name:string>', 'Node display name')
      .option('--host <host:string>', 'Hostname or IP', { default: 'localhost' })
      .option('--port <port:number>', 'A2A server port', { default: 4220 })
      .option('--group <group:string>', 'Node group')
      .option('--tier <tier:string>', 'Capability tier')
      .action(async (opts: Record<string, unknown>) => {
        const { initSwarmCoordinator } = await import(
          '../../packages/infra/src/swarm/coordinator.ts'
        );
        const { registerSwarmHandler } = await import(
          '../../packages/server/src/a2a/server.ts'
        );
        const { handleSwarmDirective } = await import(
          '../../packages/infra/src/swarm/directive-handler.ts'
        );

        let name = opts.name as string | undefined;
        if (!name) name = await Input.prompt('Node name:');

        const host = opts.host as string;
        const port = opts.port as number;
        const group = (opts.group as string) || undefined;
        const tier = (opts.tier as string) || undefined;

        registerSwarmHandler({
          handle: (kind, payload, directiveId, sourceNodeId) =>
            handleSwarmDirective(
              { kind: kind as never, payload, directiveId },
              { sourceNodeId },
            ),
        });

        const nodeId = await initSwarmCoordinator({
          name,
          host,
          port,
          group,
          tier: tier as never,
        });

        console.log(green(`Swarm node initialized: ${nodeId}`));
        console.log(`  Name: ${cyan(name)}  Host: ${cyan(host)}  Port: ${cyan(String(port))}`);
        console.log(`  The node will heartbeat every 30s and auto-discover peers.`);
      }),
  );

swarmCommand
  .command(
    'nodes',
    cortexCommand('nodes')
      .description('List connected swarm nodes')
      .action(async () => {
        const { listNodes, markNodesOffline } = await import(
          '../../packages/infra/src/swarm/node-registry.ts'
        );

        await markNodesOffline();
        const nodes = await listNodes();

        if (nodes.length === 0) {
          console.log('No swarm nodes registered.');
          console.log('Run ' + cyan('cortex swarm init') + ' to join the swarm.');
          return;
        }

        console.log(bold(`\n${nodes.length} node(s):`));
        for (const n of nodes) {
          const statusColor = n.status === 'connected' || n.status === 'online'
            ? green
            : n.status === 'disconnected' || n.status === 'offline'
            ? red
            : yellow;
          console.log(`  ${n.name} (${n.nodeId}) — ${statusColor(n.status)}`);
          console.log(`    Host: ${n.host}:${String(n.port)}  Tier: ${cyan(n.tier)}`);
          if (n.group) console.log(`    Group: ${n.group}`);
          console.log(`    Sessions: ${String(n.metrics.activeSessions)}  Processes: ${String(n.metrics.activeProcesses)}`);
          console.log(`    Memory: ${String(Math.round(n.metrics.memoryUsedMb))}/${String(Math.round(n.metrics.memoryTotalMb))}MB`);
          if (n.lastHeartbeatAt) console.log(`    Last heartbeat: ${n.lastHeartbeatAt}`);
          console.log();
        }
      }),
  );

swarmCommand
  .command(
    'topology',
    cortexCommand('topology')
      .description('Show process tree across swarm nodes')
      .action(async () => {
        const { getSwarmTopology } = await import(
          '../../packages/infra/src/swarm/remote-kernel.ts'
        );

        const topology = await getSwarmTopology();

        if (topology.length === 0) {
          console.log('No swarm nodes available.');
          console.log('Run ' + cyan('cortex swarm init') + ' to join the swarm.');
          return;
        }

        console.log(bold('\nSwarm Topology:'));
        for (const t of topology) {
          const marker = t.isSelf ? cyan(' (self)') : '';
          console.log(`\n  ${bold(t.name + marker)}`);
          console.log(`    Processes: ${String(t.processCount)}  Remote: ${String(t.remoteProcessCount)}`);
          console.log(`    Tokens: ${String(t.tokenUsage.in)} in / ${String(t.tokenUsage.out)} out`);
          console.log(`    Cost: $${t.tokenUsage.cost.toFixed(4)}`);
        }
        console.log();
      }),
  );

swarmCommand
  .command(
    'report',
    cortexCommand('report')
      .description('Aggregated resource report across swarm')
      .action(async () => {
        const { swarm } = await import(
          '../../packages/infra/src/swarm/coordinator.ts'
        );

        const report = await swarm.getResourceReport();

        console.log(bold('\nSwarm Resource Report:'));
        console.log(`  Nodes: ${String(report.onlineNodes)}/${String(report.totalNodes)} online`);
        console.log(`  Total tokens: ${String(report.totalTokensIn)} in / ${String(report.totalTokensOut)} out`);
        console.log(`  Total cost: $${report.totalCostUsd.toFixed(4)}`);
        console.log(`  Total tool calls: ${String(report.totalToolCalls)}`);
        console.log(`  Total CPU ms: ${String(report.totalCpuMs)}`);
        console.log(`  Peak memory: ${String(Math.round(report.totalPeakMemoryMb))}MB`);

        if (Object.keys(report.perNode).length > 0) {
          console.log(bold('\n  Per Node:'));
          for (const [nodeId, info] of Object.entries(report.perNode)) {
            console.log(`    ${nodeId}:`);
            console.log(`      Tokens: ${String(info.tokensIn)} in / ${String(info.tokensOut)} out`);
            console.log(`      Cost: $${info.costUsd.toFixed(4)}`);
            console.log(`      Calls: ${String(info.toolCalls)}  Sessions: ${String(info.activeSessions)}`);
            console.log(`      Memory: ${String(Math.round(info.peakMemoryMb))}MB`);
          }
        }
        console.log();
      }),
  );

swarmCommand
  .command(
    'drain',
    cortexCommand('drain')
      .description('Drain this node (stop accepting new work)')
      .action(async () => {
        const { swarm } = await import(
          '../../packages/infra/src/swarm/coordinator.ts'
        );
        await swarm.drain();
        console.log(yellow('Node set to draining. No new directives will be accepted.'));
      }),
  );

swarmCommand
  .command(
    'seal',
    cortexCommand('seal')
      .description('Seal this node (graceful shutdown)')
      .action(async () => {
        const { swarm } = await import(
          '../../packages/infra/src/swarm/coordinator.ts'
        );
        await swarm.seal();
        console.log(red('Node sealed. Heartbeat stopped.'));
      }),
  );

export { swarmCommand };
