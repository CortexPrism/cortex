import { Command } from '@cliffy/command';
import { bold, dim, green, red, yellow } from '@std/fmt/colors';
import { loadConfig } from '../config/config.ts';
import { buildProvider } from '../llm/router.ts';
import { agentTurn } from '../agent/loop.ts';
import { initSessionDb, runMigrations } from '../db/migrate.ts';
import { loadSoulContext, buildSystemPrompt } from '../agent/soul.ts';
import { createSession } from '../db/sessions.ts';
import { DiscordAdapter } from '../channels/discord.ts';
import { buildEmbedder } from '../memory/embeddings.ts';

function makeSessionId(): string {
  return `sess_discord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export const discordCommand = new Command()
  .name('discord')
  .description('Connect Cortex to a Discord server')
  .option('-t, --token <token:string>', 'Discord bot token (or set DISCORD_TOKEN env var)')
  .option('--prefix <prefix:string>', 'Command prefix', { default: '!cortex' })
  .option('-m, --model <model:string>', 'Override model for this session')
  .action(async (opts: { token?: string; prefix: string; model?: string }) => {
    await runMigrations();

    const token = opts.token ?? Deno.env.get('DISCORD_TOKEN');
    if (!token) {
      console.log(red('  Error: Discord bot token required. Use --token or DISCORD_TOKEN env var.'));
      console.log(dim('  Get a token at https://discord.com/developers/applications'));
      Deno.exit(1);
    }

    const config = await loadConfig();
    let provider;
    try {
      provider = buildProvider(config);
    } catch (err) {
      console.log(red(`  Error: ${(err as Error).message}`));
      Deno.exit(1);
    }

    const activeConfig = config.providers[config.defaultProvider]!;
    const model = opts.model ?? activeConfig.model;
    const embedder = buildEmbedder(config);
    const { soul, user, memory } = await loadSoulContext();
    const systemPrompt = buildSystemPrompt(soul, undefined, user, memory);

    const perUserSessions = new Map<string, { sessionId: string; sessionDb: Awaited<ReturnType<typeof initSessionDb>> }>();

    const adapter = new DiscordAdapter({ token, prefix: opts.prefix });

    console.log(bold(green('\n  Cortex Discord adapter starting...')));
    console.log(dim(`  Provider: ${activeConfig.model}`));
    console.log(dim(`  Prefix:   ${opts.prefix}`));

    await adapter.start(async (msg, reply) => {
      let session = perUserSessions.get(msg.authorId);
      if (!session) {
        const sessionId = makeSessionId();
        const sessionDb = await initSessionDb(sessionId);
        await createSession(sessionId, 'discord');
        session = { sessionId, sessionDb };
        perUserSessions.set(msg.authorId, session);
        console.log(dim(`  New session for ${msg.authorUsername}: ${sessionId}`));
      }

      console.log(dim(`  [${msg.authorUsername}] ${msg.content.slice(0, 80)}`));

      try {
        const result = await agentTurn({
          userMessage: msg.content,
          provider: provider!,
          model,
          sessionDb: session.sessionDb,
          sessionId: session.sessionId,
          systemPrompt,
          stream: false,
          embedder: embedder ?? undefined,
        });

        const chunks: string[] = [];
        const MAX = 1900;
        for (let i = 0; i < result.response.length; i += MAX) {
          chunks.push(result.response.slice(i, i + MAX));
        }
        for (const chunk of chunks) {
          await reply(chunk);
        }
      } catch (err) {
        console.error(red(`  Agent error: ${(err as Error).message}`));
        await reply(`❌ Error: ${(err as Error).message}`);
      }
    });

    console.log(dim('  Press Ctrl+C to stop.'));
    await new Promise(() => {});
  });
