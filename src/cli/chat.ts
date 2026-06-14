import { Command } from '@cliffy/command';
import { bold, cyan, dim, green, red, yellow } from '@std/fmt/colors';
import { isFirstRun, loadConfig } from '../config/config.ts';
import { buildProvider, buildCascadeRouter } from '../llm/router.ts';
import { agentTurn } from '../agent/loop.ts';
import { initSessionDb } from '../db/migrate.ts';
import { runSetupWizard } from './setup.ts';
import { runMigrations } from '../db/migrate.ts';
import { loadSoulContext, buildSystemPrompt, ensureSoulFile } from '../agent/soul.ts';
import { createSession, closeSession } from '../db/sessions.ts';
import { logEvent } from '../db/lens.ts';
import { ToolRegistry } from '../tools/registry.ts';
import { buildEmbedder } from '../memory/embeddings.ts';
import { fileReadTool } from '../tools/builtin/file_read.ts';
import { shellTool } from '../tools/builtin/shell.ts';
import { webSearchTool } from '../tools/builtin/web_search.ts';
import { codeExecTool } from '../tools/builtin/code_exec.ts';

function makeSessionId(): string {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function printBanner(agentName: string, model: string, provider: string): void {
  console.log('');
  console.log(bold(cyan(`  ${agentName}`)) + dim(` · ${provider}/${model}`));
  console.log(dim('  Type your message. Press Ctrl+C or type /exit to quit.\n'));
}

function printCost(costUsd: number, durationMs: number): void {
  if (costUsd > 0) {
    console.log(dim(`\n  [${durationMs}ms · $${costUsd.toFixed(6)}]`));
  } else {
    console.log(dim(`\n  [${durationMs}ms]`));
  }
}

export const chatCommand = new Command()
  .name('chat')
  .description('Start an interactive chat session with Cortex')
  .option('-m, --model <model:string>', 'Override the model for this session')
  .option('-p, --provider <provider:string>', 'Override the provider for this session')
  .option('--no-stream', 'Disable streaming output')
  .action(async (options: { model?: string; provider?: string; stream?: boolean }) => {
    let config = await loadConfig();

    if (await isFirstRun()) {
      config = await runSetupWizard(config);
    } else {
      await runMigrations();
    }

    if (options.provider) {
      config = { ...config, defaultProvider: options.provider as never };
    }

    let provider;
    try {
      provider = buildProvider(config);
    } catch (err) {
      console.error(red(`  Error: ${(err as Error).message}`));
      Deno.exit(1);
    }
    const activeProvider = provider!;

    const activeConfig = config.providers[config.defaultProvider]!;
    const model = options.model ?? activeConfig.model;
    const cascadeRouter = buildCascadeRouter(config);
    const effectiveProvider = cascadeRouter ?? activeProvider;
    const sid = makeSessionId();
    const sessionDb = await initSessionDb(sid);

    await ensureSoulFile();
    const { soul, user, memory } = await loadSoulContext();
    const systemPrompt = buildSystemPrompt(soul, undefined, user, memory);

    await createSession(sid, 'cli');
    const sessionStart = new Date().toISOString();
    await logEvent({
      event_type: 'session_start',
      session_id: sid,
      actor: 'user',
      action: 'session_start',
      summary: `CLI session started with ${activeProvider.name}/${model}`,
      started_at: sessionStart,
    });

    const embedder = buildEmbedder(config);

    const registry = new ToolRegistry();
    registry.register(fileReadTool);
    registry.register(webSearchTool);
    registry.register(shellTool);
    registry.register(codeExecTool);

    const approvalGate = async (_tool: string, command: string): Promise<boolean> => {
      await Deno.stdout.write(
        new TextEncoder().encode(
          `\n  ${yellow('⚠')}  Shell command requires approval:\n  ${bold(command)}\n  Allow? [y/N] `,
        ),
      );
      const buf = new Uint8Array(16);
      const n = await Deno.stdin.read(buf);
      const answer = n ? new TextDecoder().decode(buf.subarray(0, n)).trim().toLowerCase() : '';
      return answer === 'y' || answer === 'yes';
    };

    printBanner(config.agent.name, model, activeProvider.name);

    const useStream = options.stream !== false;
    const enc = new TextEncoder();

    while (true) {
      const line = await readLine(cyan('  You › '));

      if (line === null || line.trim() === '/exit' || line.trim() === '/quit') {
        console.log(dim('\n  Session closed.\n'));
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
          onChunk: useStream
            ? (chunk) => { Deno.stdout.write(enc.encode(chunk)); }
            : undefined,
          registry,
          toolContext: { workingDir: Deno.cwd(), approvalGate },
          embedder,
        });

        if (!useStream) {
          await Deno.stdout.write(enc.encode(result.response));
        }

        printCost(result.costUsd, result.durationMs);
      } catch (err) {
        console.error(red(`\n  Error: ${(err as Error).message}\n`));
      }

      console.log('');
    }
  });

async function handleSlashCommand(input: string, _sessionId: string): Promise<void> {
  const cmd = input.slice(1).split(' ')[0];
  switch (cmd) {
    case 'help':
      console.log(dim('  Commands: /help /soul /exit /quit'));
      break;
    case 'soul': {
      const ctx = await loadSoulContext();
      console.log(dim('\n--- SOUL.md ---'));
      console.log(dim(ctx.soul));
      if (ctx.user) { console.log(dim('\n--- USER.md ---')); console.log(dim(ctx.user)); }
      if (ctx.memory) { console.log(dim('\n--- MEMORY.md ---')); console.log(dim(ctx.memory)); }
      console.log(dim('---------------\n'));
      break;
    }
    default:
      console.log(yellow(`  Unknown command: ${input}`));
  }
}

async function readLine(prompt: string): Promise<string | null> {
  await Deno.stdout.write(new TextEncoder().encode(prompt));
  const buf = new Uint8Array(4096);
  const n = await Deno.stdin.read(buf);
  if (n === null) return null;
  return new TextDecoder().decode(buf.subarray(0, n)).replace(/\r?\n$/, '');
}
