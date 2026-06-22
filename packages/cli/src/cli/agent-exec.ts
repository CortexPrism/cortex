import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { buildProvider, buildRouter } from '../../../../src/llm/router.ts';
import { agentTurn } from '../../../../src/agent/loop.ts';
import { initSessionDb } from '../../../../src/db/migrate.ts';
import { buildSystemPrompt } from '../../../../src/agent/soul.ts';
import { loadAgentIdentity } from '../../../../src/agent/manager.ts';
import { closeSession, createSession } from '../../../../src/db/sessions.ts';
import { logEvent } from '../../../../src/db/lens.ts';
import { globalRegistry } from '../../../../src/tools/registry.ts';
import { buildEmbedder } from '../../../../src/memory/embeddings.ts';
import { getDefaultAgent } from '../../../../src/agent/manager.ts';

export const execCommand = cortexCommand('exec')
  .description('Execute a one-shot agent prompt (non-interactive)')
  .arguments('<prompt:string>')
  .option('--json', 'Output result as JSON')
  .option('--max-turns <n:number>', 'Maximum tool-call rounds', { default: 8 })
  .option('-a, --agent <agent:string>', 'Use a specific agent identity')
  .option('-o, --output <file:string>', 'Write response to a file')
  .option('--no-stream', 'Disable streaming output')
  .needs('config')
  .needs('migrations')
  .action(async (opts: Record<string, unknown>, ctx: Ctx, prompt: string) => {
    const config = ctx.config!;
    const useJson = opts.json as boolean;
    const maxTurns = (opts.maxTurns as number) ?? 8;
    const outputFile = opts.output as string | undefined;
    const useStream = (opts.stream as boolean) !== false;
    const agentId = opts.agent as string | undefined;

    const agent = agentId ? await (await import('../../../../src/agent/manager.ts')).getAgent(agentId) : null;
    const effectiveAgent = agent ?? await getDefaultAgent();

    let resolvedConfig = { ...config };
    if (agent && agent.provider) {
      resolvedConfig = { ...resolvedConfig, defaultProvider: agent.provider as never };
    }
    if (agent && agent.model) {
      resolvedConfig = {
        ...resolvedConfig,
        providers: {
          ...resolvedConfig.providers,
          [resolvedConfig.defaultProvider]: {
            ...resolvedConfig.providers[resolvedConfig.defaultProvider],
            model: agent.model,
          },
        },
      };
    }

    let provider;
    try {
      provider = buildProvider(resolvedConfig);
    } catch (err) {
      console.error(`Failed to build provider: ${(err as Error).message}`);
      Deno.exit(1);
    }

    const router = buildRouter(resolvedConfig);
    const effectiveProvider = router ?? provider!;
    const model = opts.model as string ?? effectiveAgent.model ??
      resolvedConfig.providers[resolvedConfig.defaultProvider]?.model ?? 'unknown';

    const sid = `exec_${Date.now().toString(36)}`;
    const sessionDb = await initSessionDb(sid);
    const identity = await loadAgentIdentity(effectiveAgent);
    const systemPrompt = buildSystemPrompt(
      identity.soul,
      effectiveAgent.systemPrompt,
      identity.user,
      identity.memory,
    );
    const embedder = buildEmbedder(resolvedConfig);
    const registry = globalRegistry;
    const { registerAllBuiltins } = await import('../../../../src/tools/registry.ts');
    await registerAllBuiltins(registry, false);

    await createSession(sid, 'cli');
    const sessionStart = new Date().toISOString();
    await logEvent({
      event_type: 'session_start',
      session_id: sid,
      actor: 'user',
      action: 'session_start',
      summary:
        `Exec session started with agent "${effectiveAgent.name}" / ${effectiveProvider.name}/${model}`,
      started_at: sessionStart,
    });

    const result = await agentTurn({
      userMessage: prompt,
      provider: effectiveProvider,
      model,
      sessionDb,
      sessionId: sid,
      systemPrompt,
      stream: useStream && !useJson,
      onChunk: useStream && !useJson
        ? (chunk) => {
          Deno.stdout.write(new TextEncoder().encode(chunk));
        }
        : undefined,
      registry,
      toolContext: {
        workingDir: Deno.cwd(),
        agentId: 'assistant',
        workspaceDir: Deno.cwd(),
        model,
        provider: resolvedConfig.defaultProvider,
      },
      maxToolRounds: maxTurns,
      embedder,
      reasoningEffort: resolvedConfig.providers[resolvedConfig.defaultProvider]?.reasoningEffort,
    });

    await closeSession(sid);
    await logEvent({
      event_type: 'session_end',
      session_id: sid,
      actor: 'user',
      action: 'session_end',
      started_at: new Date().toISOString(),
    });
    sessionDb.close();

    if (useJson) {
      const json = {
        success: true,
        output: result.response,
        cost: result.costUsd,
        durationMs: result.durationMs,
        turns: result.toolCallsMade ?? 0,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        hitToolCeiling: result.hitToolCeiling,
      };
      console.log(JSON.stringify(json));
    } else if (!useStream) {
      console.log(result.response);
    }

    if (outputFile) {
      await Deno.writeTextFile(outputFile, result.response);
    }
  });
