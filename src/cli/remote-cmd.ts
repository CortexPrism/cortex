import { Command } from '@cliffy/command';
import { Input, Secret } from '@cliffy/prompt';
import { listAgents, saveAgentConfig, listAgentConfigs, removeAgentConfig } from '../remote/manager.ts';
import type { RemoteAgentInfo } from '../remote/types.ts';
import { bold, cyan, green, red, yellow } from '@std/fmt/colors';

const remoteCommand = new Command()
  .name('remote')
  .description('Manage remote Cortex agents')
  .action(() => {
    const agents = listAgents();
    const configs = listAgentConfigs();

    if (configs.length === 0 && agents.length === 0) {
      console.log('No remote agents configured.');
      console.log('Use `cortex remote add` to configure a remote agent.');
      return;
    }

    if (agents.length > 0) {
      console.log(`\n${agents.length} connected agent(s):\n`);
      for (const a of agents) {
        const statusColor = a.status === 'connected' ? green : a.status === 'error' ? red : yellow;
        console.log(`  ${a.name} (${a.id}) — ${statusColor(a.status)}`);
        console.log(`    Endpoint: ${a.endpoint}`);
        console.log(`    Last heartbeat: ${a.lastHeartbeat}`);
        console.log(`    Capabilities: ${a.capabilities.join(', ')}`);
        console.log();
      }
    }

    if (configs.length > 0) {
      console.log(`\n${configs.length} configured agent(s):\n`);
      for (const c of configs) {
        const connected = agents.some((a) => a.id === c.id);
        console.log(`  ${c.name} (${c.id}) — ${connected ? green('connected') : yellow('offline')}`);
        console.log(`    Endpoint: ${c.endpoint}`);
        console.log();
      }
    }
  });

remoteCommand
  .command('add')
  .description('Configure a remote agent')
  .action(async () => {
    const name = await Input.prompt('Agent name:');
    const endpoint = await Input.prompt({
      message: 'WebSocket endpoint (ws://host:port):',
      default: 'ws://localhost:3000/ws/remote',
    });
    const token = await Secret.prompt('Auth token:');

    const id = `remote_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now().toString(36)}`;

    saveAgentConfig({
      id,
      name,
      token,
      endpoint,
      reconnectIntervalMs: 5000,
      heartbeatIntervalMs: 30000,
    });

    console.log(green(`\nRemote agent "${name}" configured.`));
    console.log(`Run on the target machine: ${cyan(`cortex remote connect ${id}`)}`);
  });

remoteCommand
  .command('connect <id:string>')
  .description('Connect as a remote agent (run on target machine)')
  .action(async (_opts: void, id: string) => {
    const config = listAgentConfigs().find((c) => c.id === id);
    if (!config) {
      console.error(`Agent config "${id}" not found. Run "cortex remote add" first.`);
      return;
    }

    const { runRemoteAgent } = await import('../remote/agent.ts');
    console.error(bold(`Starting remote agent: ${config.name}`));
    console.error(`Connecting to: ${config.endpoint}\n`);

    await runRemoteAgent({
      endpoint: config.endpoint,
      token: config.token,
      agentId: config.id,
      name: config.name,
      reconnectMs: config.reconnectIntervalMs,
      heartbeatMs: config.heartbeatIntervalMs,
    });
  });

remoteCommand
  .command('remove <id:string>')
  .description('Remove a remote agent config')
  .action((_opts: void, id: string) => {
    const ok = removeAgentConfig(id);
    console.log(ok ? `Agent "${id}" removed.` : `Agent "${id}" not found.`);
  });

export { remoteCommand };
