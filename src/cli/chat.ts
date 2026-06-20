import { Command } from '@cliffy/command';
import { bold, cyan, dim, green, red, yellow } from '@std/fmt/colors';
import { isFirstRun, loadConfig } from '../config/config.ts';
import type { AgentConfig } from '../config/config.ts';
import { configureLogger } from '../utils/logger.ts';
import { PATHS } from '../config/paths.ts';
import { buildProvider, buildRouter } from '../llm/router.ts';
import { agentTurn } from '../agent/loop.ts';
import { initSessionDb } from '../db/migrate.ts';
import { runSetupWizard } from './setup.ts';
import { runMigrations } from '../db/migrate.ts';
import { buildSystemPrompt, ensureSoulFile, loadSoulContext } from '../agent/soul.ts';
import { closeSession, createSession, getSession, resumeSession } from '../db/sessions.ts';
import { logEvent } from '../db/lens.ts';
import { globalRegistry } from '../tools/registry.ts';
import type { Tool } from '../tools/types.ts';
import { ensureDaemons } from './daemon.ts';
import { buildEmbedder } from '../memory/embeddings.ts';
import {
  formatSkillsAsAvailableList,
  getAllHumanSkills,
  registerBuiltinSkills,
} from '../memory/skills.ts';
import { getDefaultAgent, listAgents, loadAgentIdentity } from '../agent/manager.ts';
import { i18n } from '../i18n/service.ts';

function makeSessionId(): string {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function printBanner(agentName: string, model: string, provider: string): void {
  console.log('');
  console.log(bold(cyan(`  ${agentName}`)) + dim(` · ${provider}/${model}`));
  console.log(dim(i18n.t('cli.chat.banner.promptHint') + '\n'));
}

function printCost(costUsd: number, durationMs: number): void {
  if (costUsd > 0) {
    console.log(dim(
      '\n  ' + i18n.t('cli.chat.cost.withCost', {
        durationMs: String(durationMs),
        costUsd: costUsd.toFixed(6),
      }),
    ));
  } else {
    console.log(dim(
      '\n  ' + i18n.t('cli.chat.cost.withoutCost', {
        durationMs: String(durationMs),
      }),
    ));
  }
}

export const chatCommand = new Command()
  .name('chat')
  .description('Start an interactive chat session with Cortex')
  .option('-m, --model <model:string>', 'Override the model for this session')
  .option('-p, --provider <provider:string>', 'Override the provider for this session')
  .option('-a, --agent <agent:string>', 'Use a specific agent identity')
  .option('-s, --resume <sessionId:string>', 'Resume an existing session')
  .option('--list-agents', 'List available agents and exit')
  .option('--no-stream', 'Disable streaming output')
  .action(
    async (
      options: {
        model?: string;
        provider?: string;
        agent?: string;
        resume?: string;
        listAgents?: boolean;
        stream?: boolean;
      },
    ) => {
      let config = await loadConfig();

      const _loggingCfg = config.logging ?? { level: 'error', fileEnabled: true };
      configureLogger({
        level: _loggingCfg.level as import('../utils/logger.ts').LogLevel,
        fileEnabled: _loggingCfg.fileEnabled,
        filePath: _loggingCfg.filePath ?? PATHS.logFile,
        fileMaxBytes: _loggingCfg.fileMaxBytes,
        fileMaxFiles: _loggingCfg.fileMaxFiles,
      });

      if (await isFirstRun()) {
        config = await runSetupWizard(config);
      } else {
        await runMigrations();
      }

      // List agents and exit
      if (options.listAgents) {
        const agents = await listAgents();
        console.log(bold('\n  ' + i18n.t('cli.chat.listAgents.heading')));
        for (const a of agents) {
          const active = config.defaultAgent === a.id ? green(' ●') : dim(' ○');
          const p = a.provider ? ` [${a.provider}/${a.model || '?'}]` : '';
          console.log(`  ${active}  ${bold(a.name)} ${dim(`(${a.id})`)}${p}`);
        }
        console.log('');
        Deno.exit(0);
      }

      // Ensure background daemons are running
      ensureDaemons().catch(() => {});

      // Resolve agent
      let agent: AgentConfig;
      if (options.agent) {
        const { getAgent } = await import('../agent/manager.ts');
        const found = await getAgent(options.agent);
        if (!found) {
          console.error(
            red('  ' + i18n.t('cli.chat.error.agentNotFound', { agent: options.agent! })),
          );
          Deno.exit(1);
        }
        agent = found;
      } else {
        agent = await getDefaultAgent();
      }

      // Apply agent overrides
      if (options.provider) {
        config = { ...config, defaultProvider: options.provider as never };
      } else if (agent.provider) {
        config = { ...config, defaultProvider: agent.provider as never };
      }

      let provider;
      try {
        provider = buildProvider(config);
      } catch (err) {
        console.error(
          red('  ' + i18n.t('cli.chat.error.generic', { message: (err as Error).message })),
        );
        Deno.exit(1);
      }
      const activeProvider = provider!;
      const model = options.model ?? agent.model ??
        config.providers[config.defaultProvider]?.model ?? 'unknown';

      const reasoningEffort = config.providers[config.defaultProvider]?.reasoningEffort;

      const router = buildRouter(config);
      const effectiveProvider = router ?? activeProvider;
      const sid = options.resume ?? makeSessionId();
      const sessionDb = await initSessionDb(sid);

      // Load agent identity
      const identity = await loadAgentIdentity(agent);
      let systemPrompt = buildSystemPrompt(
        identity.soul,
        agent.systemPrompt,
        identity.user,
        identity.memory,
      );

      const embedder = buildEmbedder(config);

      // Register built-in skills and load filesystem skills at startup
      await registerBuiltinSkills(undefined, embedder).catch(() => {});
      // Inject only active human-authored skills into the system prompt (lazy)
      const humanSkills = await getAllHumanSkills().catch(() => []);
      if (humanSkills.length > 0) {
        systemPrompt += formatSkillsAsAvailableList(humanSkills);
      }

      if (options.resume) {
        const existing = await getSession(sid);
        if (!existing) {
          console.error(red('  ' + i18n.t('cli.chat.error.sessionNotFound', { id: sid })));
          Deno.exit(1);
        }
        await resumeSession(sid);
      } else {
        await createSession(sid, 'cli');
      }
      const sessionStart = new Date().toISOString();
      await logEvent({
        event_type: 'session_start',
        session_id: sid,
        actor: 'user',
        action: 'session_start',
        summary: `CLI session started with agent "${agent.name}" / ${activeProvider.name}/${model}`,
        started_at: sessionStart,
      });

      // Build tool registry respecting agent's tool allow-list (centralized registration)
      const registry = globalRegistry;
      const { registerAllBuiltins } = await import('../tools/registry.ts');
      const allTools = await registerAllBuiltins(registry, false); // Exclude codegraph in CLI

      // Filter to allowed tools if agent specifies a subset
      if (agent.tools?.length) {
        // Clear registry and re-register only allowed tools
        for (const name of Object.keys(allTools)) {
          registry.unregister(name);
        }
        for (const name of agent.tools) {
          if (allTools[name]) {
            registry.register(allTools[name]);
          }
        }
      }

      // Load active plugin tools
      const { pluginManager } = await import('../plugins/manager.ts');
      await pluginManager.loadAll().catch((e) => {
        console.error(
          dim('  ' + i18n.t('cli.chat.warning.pluginLoad', { message: (e as Error).message })),
        );
      });

      const approvalGate = async (
        tool: string,
        command: string,
        sampleData?: string,
      ): Promise<boolean> => {
        await Deno.stdout.write(
          new TextEncoder().encode(
            `\n  ${yellow('⚠')}  ${tool} action requires approval:\n  ${bold(command)}${
              sampleData ? `\n  Sample: ${sampleData}` : ''
            }\n  Allow? [y/N] `,
          ),
        );
        const buf = new Uint8Array(16);
        const n = await Deno.stdin.read(buf);
        const answer = n ? new TextDecoder().decode(buf.subarray(0, n)).trim().toLowerCase() : '';
        return answer === 'y' || answer === 'yes';
      };

      printBanner(agent.name, model, activeProvider.name);

      const useStream = options.stream !== false;
      const enc = new TextEncoder();

      while (true) {
        const line = await readLine(cyan('  You › '));

        if (line === null || line.trim() === '/exit' || line.trim() === '/quit') {
          console.log(dim('\n  ' + i18n.t('cli.chat.sessionClosed') + '\n'));
          await Promise.allSettled([
            closeSession(sid),
            logEvent({
              event_type: 'session_end',
              session_id: sid,
              actor: 'user',
              action: 'session_end',
              started_at: new Date().toISOString(),
            }),
          ]);
          sessionDb.close();
          break;
        }

        const input = line.trim();
        if (!input) continue;

        if (input.startsWith('/')) {
          await handleSlashCommand(input, sid);
          continue;
        }

        await Deno.stdout.write(enc.encode(bold(green('\n  Cortex › '))));

        try {
          const result = await agentTurn({
            userMessage: input,
            provider: effectiveProvider,
            model,
            sessionDb,
            sessionId: sid,
            systemPrompt,
            stream: useStream,
            reasoningEffort,
            onChunk: useStream
              ? (chunk) => {
                Deno.stdout.write(enc.encode(chunk));
              }
              : undefined,
            registry,
            toolContext: {
              workingDir: Deno.cwd(),
              approvalGate,
              agentId: 'default',
              workspaceDir: Deno.cwd(),
              model,
              provider: config.defaultProvider,
            },
            embedder,
          });

          if (!useStream) {
            await Deno.stdout.write(enc.encode(result.response));
          }

          printCost(result.costUsd, result.durationMs);
        } catch (err) {
          console.error(
            red(
              '\n  ' + i18n.t('cli.chat.error.generic', { message: (err as Error).message }) + '\n',
            ),
          );
        }

        console.log('');
      }
    },
  );

async function handleSlashCommand(input: string, _sessionId: string): Promise<void> {
  const cmd = input.slice(1).split(' ')[0];
  switch (cmd) {
    case 'help':
      console.log(dim('  ' + i18n.t('cli.chat.help.commandList')));
      break;
    case 'soul': {
      const ctx = await loadSoulContext();
      console.log(dim(i18n.t('cli.chat.soul.soulHeader')));
      console.log(dim(ctx.soul));
      if (ctx.user) {
        console.log(dim(i18n.t('cli.chat.soul.userHeader')));
        console.log(dim(ctx.user));
      }
      if (ctx.memory) {
        console.log(dim(i18n.t('cli.chat.soul.memoryHeader')));
        console.log(dim(ctx.memory));
      }
      console.log(dim(i18n.t('cli.chat.soul.footer') + '\n'));
      break;
    }
    default:
      console.log(yellow('  ' + i18n.t('cli.chat.unknownCommand', { input })));
  }
}

async function readLine(prompt: string): Promise<string | null> {
  await Deno.stdout.write(new TextEncoder().encode(prompt));
  const buf = new Uint8Array(4096);
  const n = await Deno.stdin.read(buf);
  if (n === null) return null;
  return new TextDecoder().decode(buf.subarray(0, n)).replace(/\r?\n$/, '');
}
