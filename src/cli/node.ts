import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { Input, Secret, Select } from '@cliffy/prompt';
import {
  deregisterNode,
  getNode,
  listNodes,
  nodeGroups,
  registerNode,
  rotateNodeToken,
} from '../hub/node-registry.ts';
import type { NodeTier } from '../hub/node-registry.ts';
import { bold, cyan, green, red, yellow } from '@std/fmt/colors';
import { i18n } from '../i18n/service.ts';

const nodeCommand = cortexCommand('node')
  .description('Manage remote Cortex Nodes')
  .action(async () => {
    const nodes = await listNodes();
    const groups = await nodeGroups();

    if (nodes.length === 0) {
      console.log(i18n.t('cli.node.noNodes'));
      console.log(i18n.t('cli.node.useRegisterHint'));
      return;
    }

    console.log(i18n.t('cli.node.nodesRegistered', { count: String(nodes.length) }));
    for (const n of nodes) {
      const statusColor = n.status === 'connected'
        ? green
        : n.status === 'error'
        ? red
        : n.status === 'connecting'
        ? yellow
        : yellow;
      console.log(`  ${n.name} (${n.id}) — ${statusColor(n.status)}`);
      console.log(`    Tier: ${cyan(n.tier)}  Endpoint: ${n.endpoint}`);
      if (n.group_name) console.log(`    Group: ${n.group_name}`);
      if (n.last_heartbeat) console.log(`    Last heartbeat: ${n.last_heartbeat}`);
      console.log(`    Capabilities: ${n.capabilities.join(', ') || 'none'}`);
      console.log();
    }

    if (groups.length > 0) {
      console.log(`Groups: ${groups.join(', ')}\n`);
    }
  });

nodeCommand
  .command(
    'register',
    cortexCommand('register')
      .description('Register a new remote Node')
      .action(async () => {
        const name = await Input.prompt('Node name:');
        const endpoint = await Input.prompt({
          message: 'WebSocket endpoint (wss://host:port/ws/node):',
          default: 'wss://localhost:9001/ws/node',
        });
        const tier = await Select.prompt({
          message: 'Capability tier:',
          options: [
            { name: 'root', value: 'root' },
            { name: 'sudo', value: 'sudo' },
            { name: 'unprivileged', value: 'unprivileged' },
          ],
          default: 'unprivileged',
        }) as NodeTier;
        const group = await Input.prompt({
          message: 'Group (optional, press enter to skip):',
        });
        const capabilitiesRaw = await Input.prompt({
          message: 'Capabilities (comma-separated, press enter for defaults):',
        });

        const capabilities = capabilitiesRaw
          ? capabilitiesRaw.split(',').map((s) => s.trim()).filter(Boolean)
          : undefined;

        const result = await registerNode({
          name,
          endpoint,
          tier,
          capabilities,
          group: group || undefined,
        });

        console.log(green(i18n.t('cli.node.nodeRegistered', { name })));
        console.log(i18n.t('cli.node.nodeId', { id: cyan(result.node.id) }));
        console.log(i18n.t('cli.node.nodeToken', { token: cyan(result.token) }));
        console.log(i18n.t('cli.node.copyTokenHint'));
      }),
  );

nodeCommand
  .command(
    'show',
    cortexCommand('show')
      .arguments('<id:string>')
      .description('Show Node details')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx, id: string) => {
        const node = await getNode(id);
        if (!node) {
          console.error(red(i18n.t('cli.node.nodeNotFound', { id })));
          return;
        }

        console.log(bold(`\n${node.name} (${node.id})`));
        console.log(`  Status:     ${node.status}`);
        console.log(`  Tier:       ${node.tier}`);
        console.log(`  Endpoint:   ${node.endpoint}`);
        console.log(`  Group:      ${node.group_name ?? 'none'}`);
        console.log(`  Version:    ${node.version ?? 'unknown'}`);
        console.log(`  Capabilities: ${node.capabilities.join(', ') || 'none'}`);
        console.log(`  Registered: ${node.registered_at}`);
        if (node.last_heartbeat) console.log(`  Heartbeat:  ${node.last_heartbeat}`);
        if (node.last_processed_directive_id) {
          console.log(`  Last directive: ${node.last_processed_directive_id}`);
        }
        console.log();
      }),
  );

nodeCommand
  .command(
    'deregister',
    cortexCommand('deregister')
      .arguments('<id:string>')
      .description('Deregister a Node')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx, id: string) => {
        const ok = await deregisterNode(id);
        if (!ok) {
          console.error(red(i18n.t('cli.node.nodeNotFound', { id })));
          return;
        }
        console.log(green(i18n.t('cli.node.nodeDeregistered', { id })));
      }),
  );

nodeCommand
  .command(
    'rekey',
    cortexCommand('rekey')
      .arguments('<id:string>')
      .description('Rotate Node capability token')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx, id: string) => {
        const token = await rotateNodeToken(id);
        if (!token) {
          console.error(red(i18n.t('cli.node.nodeNotFound', { id })));
          return;
        }
        console.log(green(i18n.t('cli.node.tokenRotated', { id })));
        console.log(i18n.t('cli.node.newToken', { token: cyan(token) }));
        console.log(`\nCopy this token to the Node machine. It will NOT be shown again.\n`);
      }),
  );

nodeCommand
  .command(
    'connect',
    cortexCommand('connect')
      .description('Connect as a Cortex Node (run on the target machine)')
      .option('--id <id:string>', 'Node ID')
      .option('--token <token:string>', 'Capability token')
      .option('--endpoint <endpoint:string>', 'Hub WebSocket endpoint (wss://hub:port/ws/node)')
      .option('--tier <tier:string>', 'Capability tier (root, sudo, unprivileged)')
      .option('--group <group:string>', 'Node group name')
      .option('--name <name:string>', 'Node display name')
      .option('--reconnect-ms <ms:number>', 'Reconnect interval in ms', { default: 5000 })
      .option('--heartbeat-ms <ms:number>', 'Heartbeat interval in ms', { default: 30000 })
      .option('--timeout-ms <ms:number>', 'Directive timeout in ms', { default: 300000 })
      .action(async (opts: Record<string, unknown>, _ctx: Ctx) => {
        let id = opts.id as string | undefined;
        let token = opts.token as string | undefined;
        let endpoint = opts.endpoint as string | undefined;
        let tier = (opts.tier as NodeTier) ?? 'unprivileged';
        let name = (opts.name as string) ?? id ?? 'unnamed';

        if (!id) {
          id = await Input.prompt('Node ID:');
          name = name === 'unnamed' ? id : name;
        }
        if (!token) {
          token = await Secret.prompt('Token:');
        }
        if (!endpoint) {
          endpoint = await Input.prompt({
            message: 'Hub endpoint:',
            default: 'wss://localhost:9001/ws/node',
          });
        }
        if (!opts.tier) {
          tier = await Select.prompt({
            message: 'Capability tier:',
            options: [
              { name: 'root', value: 'root' },
              { name: 'sudo', value: 'sudo' },
              { name: 'unprivileged', value: 'unprivileged' },
            ],
            default: 'unprivileged',
          }) as NodeTier;
        }

        const { runNodeAgent } = await import('../remote/agent.ts');
        console.error(bold(`Starting Cortex Node: ${name}`));
        console.error(`  ID: ${cyan(id)}  Tier: ${cyan(tier)}`);
        console.error(`  Hub: ${cyan(endpoint)}\n`);

        await runNodeAgent({
          endpoint,
          token,
          agentId: id,
          name,
          tier,
          group: opts.group as string | undefined,
          reconnectMs: opts.reconnectMs as number,
          heartbeatMs: opts.heartbeatMs as number,
          directiveTimeoutMs: opts.timeoutMs as number,
        });
      }),
  );

export { nodeCommand };
