import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { bold, type cyan, dim, green, red, type yellow } from '@std/fmt/colors';
import {
  cloneAgent,
  deleteAgent,
  getAgent,
  listAgents,
  loadAgentIdentity,
  registerAgent,
  selectAgent,
  updateAgent,
} from '../../../../src/agent/manager.ts';
import type { AgentCategory, ProviderKind } from '../../../../src/config/config.ts';
import { i18n } from '../../../../src/i18n/service.ts';

export const agentCommand = cortexCommand('agent')
  .description('Manage agent identities — create, select, update, and delete agents')
  .command(
    'list',
    cortexCommand('list')
      .description('List all registered agents')
      .needs('config')
      .action(async (_opts: Record<string, unknown>, ctx: Ctx) => {
        const agents = await listAgents();
        if (agents.length === 0) {
          console.log(dim(i18n.t('cli.agent.noAgentsRegistered')));
          return;
        }
        const active = ctx.config!.defaultAgent || 'default';
        console.log(bold(i18n.t('cli.agent.registeredAgents')));
        console.log(dim('  ' + '─'.repeat(50)));
        for (const a of agents) {
          const isActive = a.id === active;
          const marker = isActive ? green('●') : dim('○');
          const provider = a.provider ? dim(` [${a.provider}/${a.model || '?'}]`) : '';
          const tags = a.tags?.length ? dim(` (${a.tags.join(', ')})`) : '';
          console.log(`  ${marker}  ${bold(a.name)} ${dim(`(${a.id})`)}${provider}${tags}`);
          if (a.description) console.log(`      ${dim(a.description)}`);
          if (isActive) console.log(`      ${green('← active')}`);
        }
        console.log('');
      }),
  )
  .command(
    'show',
    cortexCommand('show')
      .description('Show detailed agent configuration')
      .arguments('<id:string>')
      .needs('config')
      .action(async (_opts: Record<string, unknown>, ctx: Ctx, id: string) => {
        const agent = await getAgent(id);
        if (!agent) {
          console.error(red(i18n.t('cli.agent.agentNotFound', { id })));
          Deno.exit(1);
        }
        const isActive = ctx.config!.defaultAgent === agent.id;
        console.log(bold(`\n  Agent: ${agent.name}`));
        console.log(dim(`  ${isActive ? green('● active') : '○ inactive'} · ${agent.id}`));
        console.log(dim('  ' + '─'.repeat(50)));
        if (agent.description) console.log(`  ${agent.description}\n`);

        const fields: [string, string][] = [
          ['ID', agent.id],
          ['Name', agent.name],
          ['Icon', agent.icon || '(none)'],
          ['Category', agent.category || '(default)'],
          ['Version', agent.version || '(none)'],
          ['Provider', agent.provider || '(default)'],
          ['Model', agent.model || '(default)'],
          ['Temperature', agent.temperature != null ? String(agent.temperature) : '(default)'],
          ['Max Turns', agent.maxTurns != null ? String(agent.maxTurns) : '(default)'],
          ['Tools', agent.tools?.length ? agent.tools.join(', ') : '(all)'],
          ['Soul', agent.soul ? '(inline)' : agent.soulFile || '(default)'],
          ['Tags', agent.tags?.join(', ') || '(none)'],
        ];
        for (const [k, v] of fields) {
          console.log(`  ${dim(k + ':')} ${v}`);
        }
        console.log('');
      }),
  )
  .command(
    'create',
    cortexCommand('create')
      .description('Create a new agent')
      .arguments('<name:string>')
      .option('-d, --description <desc:string>', 'Agent description')
      .option(
        '-p, --provider <provider:string>',
        'Provider (anthropic|openai|ollama|google|deepseek|groq|…)',
      )
      .option('-m, --model <model:string>', 'Model name')
      .option('-t, --temperature <temp:number>', 'Model temperature (0–2)')
      .option('--icon <icon:string>', 'Emoji or text icon for UI display')
      .option(
        '--category <category:string>',
        'Agent category (general|specialist|assistant|creative|analytics|ops|custom)',
      )
      .option('--version <version:string>', 'Agent version string')
      .option('--soul <soul:string>', 'Path to a SOUL.md file')
      .option('--system-prompt <prompt:string>', 'Additional system prompt text')
      .option('--tools <tools:string>', 'Comma-separated tool allow-list')
      .option('--tags <tags:string>', 'Comma-separated tags')
      .action(async (opts: Record<string, unknown>, _ctx: Ctx, name: string) => {
        const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const agent = await registerAgent({
          id,
          name,
          description: opts.description as string | undefined,
          icon: opts.icon as string | undefined,
          category: opts.category as AgentCategory,
          version: opts.version as string | undefined,
          provider: opts.provider as ProviderKind,
          model: opts.model as string | undefined,
          temperature: opts.temperature as number | undefined,
          soulFile: opts.soul as string | undefined,
          systemPrompt: opts.systemPrompt as string | undefined,
          tools: (opts.tools as string)?.split(',').map((s: string) => s.trim()).filter(Boolean),
          tags: (opts.tags as string)?.split(',').map((s: string) => s.trim()).filter(Boolean),
        });
        console.log(green(i18n.t('cli.agent.createdAgent', { name: agent.name, id: agent.id })));
      }),
  )
  .command(
    'update',
    cortexCommand('update')
      .description('Update an existing agent')
      .arguments('<id:string>')
      .option('-n, --name <name:string>', 'New name')
      .option('-d, --description <desc:string>', 'New description')
      .option(
        '-p, --provider <provider:string>',
        'Provider (anthropic|openai|ollama|google|deepseek|groq|…)',
      )
      .option('-m, --model <model:string>', 'Model name')
      .option('-t, --temperature <temp:number>', 'Model temperature (0–2)')
      .option('--icon <icon:string>', 'Emoji or text icon for UI display')
      .option('--category <category:string>', 'Agent category')
      .option('--version <version:string>', 'Agent version string')
      .option('--soul <soul:string>', 'Path to a SOUL.md file or "inline:<content>"')
      .option('--system-prompt <prompt:string>', 'Additional system prompt')
      .option('--tools <tools:string>', 'Comma-separated tool allow-list (empty=all)')
      .option('--tags <tags:string>', 'Comma-separated tags')
      .action(async (opts: Record<string, unknown>, _ctx: Ctx, id: string) => {
        const patch: Record<string, unknown> = {};
        if (opts.name) patch.name = opts.name;
        if (opts.description !== undefined) patch.description = opts.description;
        if (opts.icon !== undefined) patch.icon = opts.icon;
        if (opts.category !== undefined) patch.category = opts.category;
        if (opts.version !== undefined) patch.version = opts.version;
        if (opts.provider) patch.provider = opts.provider;
        if (opts.model) patch.model = opts.model;
        if (opts.temperature !== undefined) patch.temperature = opts.temperature;
        if (opts.soul) {
          if ((opts.soul as string).startsWith('inline:')) {
            patch.soul = (opts.soul as string).slice(7);
            patch.soulFile = undefined;
          } else {
            patch.soulFile = opts.soul;
            patch.soul = undefined;
          }
        }
        if (opts.systemPrompt !== undefined) patch.systemPrompt = opts.systemPrompt;
        if (opts.tools !== undefined) {
          patch.tools = opts.tools
            ? (opts.tools as string).split(',').map((s: string) => s.trim()).filter(Boolean)
            : [];
        }
        if (opts.tags !== undefined) {
          patch.tags = opts.tags
            ? (opts.tags as string).split(',').map((s: string) => s.trim()).filter(Boolean)
            : [];
        }

        const agent = await updateAgent(id, patch);
        console.log(green(i18n.t('cli.agent.updatedAgent', { name: agent.name, id: agent.id })));
      }),
  )
  .command(
    'delete',
    cortexCommand('delete')
      .description('Delete an agent')
      .arguments('<id:string>')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx, id: string) => {
        try {
          await deleteAgent(id);
          console.log(green(i18n.t('cli.agent.deletedAgent', { id })));
        } catch (e) {
          console.error(red(`  ${(e as Error).message}`));
          Deno.exit(1);
        }
      }),
  )
  .command(
    'select',
    cortexCommand('select')
      .description('Set the active/default agent')
      .arguments('<id:string>')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx, id: string) => {
        try {
          await selectAgent(id);
          const agent = await getAgent(id);
          console.log(green(i18n.t('cli.agent.activeAgentSet', { name: agent?.name || id, id })));
        } catch (e) {
          console.error(red(`  ${(e as Error).message}`));
          Deno.exit(1);
        }
      }),
  )
  .command(
    'inspect',
    cortexCommand('inspect')
      .description("Inspect an agent's loaded identity (soul/user/memory)")
      .arguments('<id:string>')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx, id: string) => {
        const agent = await getAgent(id);
        if (!agent) {
          console.error(red(i18n.t('cli.agent.agentNotFound', { id })));
          Deno.exit(1);
        }
        const identity = await loadAgentIdentity(agent);
        console.log(bold(`\n  Agent: ${agent.name}`));
        console.log(dim('  ' + '─'.repeat(50)));
        if (identity.soul) {
          console.log(bold('\n  ── Soul ──'));
          console.log(identity.soul);
        }
        if (identity.user) {
          console.log(bold('\n  ── User ──'));
          console.log(identity.user);
        }
        if (identity.memory) {
          console.log(bold('\n  ── Memory ──'));
          console.log(identity.memory);
        }
        console.log('');
      }),
  )
  .command(
    'import',
    cortexCommand('import')
      .description('Import an agent configuration from a URL or marketplace reference')
      .arguments('<source:string>')
      .needs('migrations')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx, source: string) => {
        let url: string;
        if (source.startsWith('marketplace:')) {
          const rest = source.slice('marketplace:'.length);
          const match = rest.match(/^([^/]+)\/agents\/(.+)$/);
          if (!match) {
            console.log(
              red(i18n.t('cli.agent.invalidMarketplaceRef')),
            );
            return;
          }
          const host = match[1];
          const slug = match[2];
          url = `https://${host}/api/marketplace/agents/${slug}/download`;
          console.log(dim(i18n.t('cli.agent.fetchingFrom', { url })));
        } else if (source.startsWith('http://') || source.startsWith('https://')) {
          url = source;
        } else {
          console.log(red(i18n.t('cli.agent.invalidSource')));
          return;
        }

        const res = await fetch(url);
        if (!res.ok) {
          console.log(
            red(
              i18n.t('cli.agent.fetchFailed', {
                status: String(res.status),
                statusText: res.statusText,
              }),
            ),
          );
          return;
        }
        const data = await res.json() as {
          name: string;
          description?: string;
          provider?: string;
          model?: string;
          temperature?: number;
          tools?: string[];
          tags?: string[];
          systemPrompt?: string;
          soulContent?: string;
        };

        if (!data.name) {
          console.log(red(i18n.t('cli.agent.invalidAgentConfig')));
          return;
        }

        try {
          const agent = await registerAgent({
            name: data.name,
            description: data.description,
            provider: data.provider as ProviderKind,
            model: data.model,
            temperature: data.temperature,
            soul: data.soulContent,
            systemPrompt: data.systemPrompt,
            tools: data.tools,
            tags: data.tags,
          });
          console.log(green(i18n.t('cli.agent.importedAgent', { name: agent.name, id: agent.id })));
        } catch (e) {
          console.log(
            red(i18n.t('cli.agent.failedToImportAgent', { message: (e as Error).message })),
          );
        }
      }),
  )
  .command(
    'clone',
    cortexCommand('clone')
      .description('Clone an existing agent with a new name')
      .arguments('<source-id:string> <new-name:string>')
      .action(
        async (_opts: Record<string, unknown>, _ctx: Ctx, sourceId: string, newName: string) => {
          try {
            const agent = await cloneAgent(sourceId, newName);
            console.log(
              green(i18n.t('cli.agent.clonedAgent', { name: agent.name, id: agent.id, sourceId })),
            );
          } catch (e) {
            console.error(red(`  ${(e as Error).message}`));
            Deno.exit(1);
          }
        },
      ),
  );
