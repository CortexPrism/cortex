import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { bold, cyan, dim, green, red, yellow } from '@std/fmt/colors';
import {
  deleteService,
  getRuntimeStatus,
  getService,
  listServices,
  registerService,
  startService,
  stopService,
  updateService,
} from '../services/manager.ts';
import { i18n } from '../i18n/service.ts';

export const serviceCommand = cortexCommand('service')
  .description('Manage micro-services — long-running agent processes with health monitoring')
  .command(
    'list',
    cortexCommand('list')
      .description('List all registered micro-services')
      .action(async () => {
        const services = await listServices();
        const runtime = await getRuntimeStatus();
        const runtimeMap = new Map(runtime.map((r) => [r.id, r]));

        if (services.length === 0) {
          console.log(dim(i18n.t('cli.service.noServices')));
          return;
        }

        console.log(bold('\n  Micro-Services'));
        console.log(dim('  ' + '─'.repeat(60)));
        for (const s of services) {
          const rt = runtimeMap.get(s.id);
          const statusColor = s.status === 'running' ? green : s.status === 'failed' ? red : dim;
          const indicator = s.status === 'running' ? '●' : s.status === 'failed' ? '✕' : '○';
          const uptime = rt?.uptime != null ? dim(` (${rt.uptime}s up)`) : '';
          console.log(
            `  ${statusColor(indicator)}  ${bold(s.name)} ${dim(`(${s.id})`)} — ${
              statusColor(s.status)
            }${uptime}`,
          );
          if (s.description) console.log(`      ${dim(s.description)}`);
          if (s.port > 0) console.log(`      ${cyan(`http://0.0.0.0:${s.port}`)}`);
          if (s.autoStart) console.log(`      ${dim('auto-start')}`);
        }
        console.log('');
      }),
  )
  .command(
    'show',
    cortexCommand('show')
      .description('Show a service configuration and status')
      .arguments('<id:string>')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx, id: string) => {
        const svc = await getService(id);
        if (!svc) {
          console.error(red(i18n.t('cli.service.serviceNotFound', { id })));
          Deno.exit(1);
        }
        const rt = (await getRuntimeStatus()).find((r) => r.id === id);
        const lines: [string, string][] = [
          ['ID', svc.id],
          ['Name', svc.name],
          ['Description', svc.description || '(none)'],
          ['Agent', svc.agentId],
          ['Provider', svc.provider || '(default)'],
          ['Model', svc.model || '(default)'],
          ['Port', svc.port > 0 ? String(svc.port) : '(none)'],
          ['Status', svc.status],
          ['PID', svc.pid ? String(svc.pid) : '(none)'],
          ['Uptime', rt?.uptime ? `${rt.uptime}s` : '(stopped)'],
          ['Auto-start', svc.autoStart ? 'yes' : 'no'],
          ['Max restarts', String(svc.maxRestarts)],
          ['Health check', `${svc.healthCheckInterval}s`],
          ['Tools', svc.tools || '(all)'],
        ];
        console.log(bold(`\n  Service: ${svc.name}`));
        console.log(dim('  ' + '─'.repeat(50)));
        for (const [k, v] of lines) {
          console.log(`  ${dim(k + ':')} ${v}`);
        }
        console.log('');
      }),
  )
  .command(
    'create',
    cortexCommand('create')
      .description('Register a new micro-service')
      .arguments('<name:string>')
      .option('-d, --description <desc:string>', 'Service description')
      .option('-a, --agent <agent:string>', 'Agent ID to use', { default: 'assistant' })
      .option('-p, --port <port:number>', 'HTTP port for API endpoint')
      .option('-m, --model <model:string>', 'Model override')
      .option('--provider <provider:string>', 'Provider override')
      .option('--tools <tools:string>', 'Comma-separated tool allow-list')
      .option('--auto-start', 'Enable auto-start on boot', { default: false })
      .option('--max-restarts <n:number>', 'Max restarts before giving up', { default: 3 })
      .option('--health-interval <n:number>', 'Health check interval in seconds', { default: 30 })
      .option('--system-prompt <prompt:string>', 'System prompt override')
      .action(async (opts: Record<string, unknown>, _ctx: Ctx, name: string) => {
        const id = await registerService({
          name,
          description: opts.description as string | undefined,
          agentId: opts.agent as string,
          model: opts.model as string | undefined,
          provider: opts.provider as string | undefined,
          systemPrompt: opts.systemPrompt as string | undefined,
          tools: opts.tools as string | undefined,
          port: (opts.port as number) ?? 0,
          autoStart: !!opts.autoStart,
          maxRestarts: (opts.maxRestarts as number) ?? 3,
          healthCheckInterval: (opts.healthInterval as number) ?? 30,
        });
        console.log(green(i18n.t('cli.service.serviceRegistered', { name, id })));
      }),
  )
  .command(
    'update',
    cortexCommand('update')
      .description('Update a service configuration')
      .arguments('<id:string>')
      .option('-n, --name <name:string>', 'New name')
      .option('-d, --description <desc:string>', 'New description')
      .option('-a, --agent <agent:string>', 'Agent ID')
      .option('-p, --port <port:number>', 'HTTP port')
      .option('-m, --model <model:string>', 'Model override')
      .option('--provider <provider:string>', 'Provider override')
      .option('--tools <tools:string>', 'Tool allow-list')
      .option('--auto-start', 'Enable auto-start', { default: undefined })
      .option('--max-restarts <n:number>', 'Max restarts')
      .option('--health-interval <n:number>', 'Health check interval')
      .option('--system-prompt <prompt:string>', 'System prompt override')
      .action(async (opts: Record<string, unknown>, _ctx: Ctx, id: string) => {
        const patch: Record<string, unknown> = {};
        if (opts.name) patch.name = opts.name;
        if (opts.description !== undefined) patch.description = opts.description;
        if (opts.agent) patch.agentId = opts.agent;
        if (opts.port !== undefined) patch.port = opts.port;
        if (opts.model) patch.model = opts.model;
        if (opts.provider) patch.provider = opts.provider;
        if (opts.tools !== undefined) patch.tools = opts.tools;
        if (opts.autoStart !== undefined) patch.autoStart = opts.autoStart;
        if (opts.maxRestarts !== undefined) patch.maxRestarts = opts.maxRestarts;
        if (opts.healthInterval !== undefined) patch.healthCheckInterval = opts.healthInterval;
        if (opts.systemPrompt !== undefined) patch.systemPrompt = opts.systemPrompt;
        await updateService(id, patch);
        console.log(green(i18n.t('cli.service.serviceUpdated', { id })));
      }),
  )
  .command(
    'delete',
    cortexCommand('delete')
      .description('Delete a service')
      .arguments('<id:string>')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx, id: string) => {
        await deleteService(id);
        console.log(green(i18n.t('cli.service.serviceDeleted', { id })));
      }),
  )
  .command(
    'start',
    cortexCommand('start')
      .description('Start a micro-service')
      .arguments('<id:string>')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx, id: string) => {
        try {
          await startService(id);
          console.log(green(i18n.t('cli.service.serviceStarted', { id })));
        } catch (e) {
          console.error(red(`  ${(e as Error).message}`));
          Deno.exit(1);
        }
      }),
  )
  .command(
    'stop',
    cortexCommand('stop')
      .description('Stop a running micro-service')
      .arguments('<id:string>')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx, id: string) => {
        await stopService(id);
        console.log(green(i18n.t('cli.service.serviceStopped', { id })));
      }),
  );
