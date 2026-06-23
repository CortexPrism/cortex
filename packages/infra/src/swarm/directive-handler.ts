/**
 * Swarm Directive Handler — Processes incoming swarm directives on the
 * receiving side of an A2A bridge call.
 *
 * When a remote node sends a directive via A2A SendMessage, this handler
 * interprets structured directive payloads and executes the appropriate
 * local action: spawning sub-agents, executing tasks, querying resources,
 * forwarding messages, or syncing state.
 */
import { kernel } from '../kernel/mod.ts';
import type { SwarmDirective, SwarmDirectiveResult, SwarmNodeId } from '../../contracts/swarm.ts';

export interface SwarmDirectiveContext {
  sourceNodeId: SwarmNodeId;
}

export type SwarmDirectiveResponse = Pick<
  SwarmDirectiveResult,
  'status' | 'output' | 'error' | 'metrics'
>;

export async function handleSwarmDirective(
  directive: Pick<SwarmDirective, 'kind' | 'payload' | 'directiveId'>,
  ctx: SwarmDirectiveContext,
): Promise<SwarmDirectiveResponse> {
  const t0 = performance.now();

  switch (directive.kind) {
    case 'query_resources':
      return handleQueryResources();

    case 'sync_state':
      return handleSyncState(directive.payload);

    case 'spawn_agent':
      return handleSpawnAgent(directive.payload, t0);

    case 'execute_task':
      return handleExecuteTask(directive.payload, t0);

    case 'forward_message':
      return handleForwardMessage(directive.payload, t0);

    default:
      return {
        status: 'failed',
        error: `Unknown directive kind: ${directive.kind}`,
      };
  }
}

async function handleQueryResources(): Promise<SwarmDirectiveResponse> {
  const t0 = performance.now();
  const resources = kernel.getAllResources();
  const totalTokens = resources.reduce(
    (acc, r) => ({ in: acc.in + r.tokensIn, out: acc.out + r.tokensOut, cost: acc.cost + r.costUsd }),
    { in: 0, out: 0, cost: 0 },
  );
  const totalCalls = resources.reduce((acc, r) => acc + r.toolCalls, 0);
  const totalCpuMs = resources.reduce((acc, r) => acc + r.cpuMs, 0);
  const peakMemoryMb = resources.reduce((max, r) => Math.max(max, r.peakMemoryMb), 0);

  let sysMemory = { totalMb: 0, usedMb: 0 };
  try {
    const mem = Deno.systemMemoryInfo?.();
    if (mem) {
      const used = mem.total - mem.free;
      sysMemory = { totalMb: mem.total / (1024 * 1024), usedMb: used / (1024 * 1024) };
    }
  } catch { /* ignore */ }

  const result = {
    nodeId: '',
    agentCount: resources.length,
    processCount: kernel.getProcessTree().length,
    tokens: { in: totalTokens.in, out: totalTokens.out, cost: totalTokens.cost },
    toolCalls: totalCalls,
    cpuMs: totalCpuMs,
    peakMemoryMb,
    systemMemory: sysMemory,
    uptimeSeconds: Math.floor(Deno.osUptime?.() ?? 0),
  };

  return {
    status: 'completed',
    output: JSON.stringify(result),
    metrics: {
      tokensIn: totalTokens.in,
      tokensOut: totalTokens.out,
      costUsd: totalTokens.cost,
      durationMs: performance.now() - t0,
      toolCalls: totalCalls,
    },
  };
}

async function handleSyncState(
  payload: Record<string, unknown>,
): Promise<SwarmDirectiveResponse> {
  const t0 = performance.now();
  const state = payload.state as Record<string, unknown> | undefined;

  if (state?.resources) {
    const res = state.resources as Array<{
      agentId: string;
      toolCalls: number;
      tokensIn: number;
      tokensOut: number;
      costUsd: number;
      cpuMs: number;
      peakMemoryMb: number;
    }>;
    for (const r of res) {
      kernel.recordTokens(r.agentId, r.tokensIn, r.tokensOut, r.costUsd);
    }
  }

  const localResources = kernel.getAllResources();
  const totalTokens = localResources.reduce(
    (acc, r) => ({ in: acc.in + r.tokensIn, out: acc.out + r.tokensOut, cost: acc.cost + r.costUsd }),
    { in: 0, out: 0, cost: 0 },
  );

  return {
    status: 'completed',
    output: JSON.stringify({
      synced: true,
      currentNodeCount: localResources.length,
      currentTokens: totalTokens,
    }),
    metrics: {
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      durationMs: performance.now() - t0,
      toolCalls: 0,
    },
  };
}

async function handleSpawnAgent(
  payload: Record<string, unknown>,
  t0: number,
): Promise<SwarmDirectiveResponse> {
  const instruction = payload.instruction as string;
  const agentType = payload.agentType as string | undefined;

  if (!instruction) {
    return { status: 'failed', error: 'spawn_agent directive missing instruction' };
  }

  try {
    const { registerAllBuiltins } = await import('../../../../src/tools/registry.ts');
    const { globalRegistry } = await import('../../../../src/tools/registry.ts');
    const { buildProvider } = await import('../../../../src/llm/router.ts');
    const { loadConfig } = await import('../../../../src/config/config.ts');
    const { agentTurn } = await import('../../../../src/agent/loop.ts');
    const { buildSystemPrompt } = await import('../../../../src/agent/soul.ts');
    const { getDefaultAgent, loadAgentIdentity } = await import('../../../../src/agent/manager.ts');
    const { initSessionDb } = await import('../../../../src/db/migrate.ts');
    const { closeSession, createSession } = await import('../../../../src/db/sessions.ts');

    const config = await loadConfig();
    const agent = await getDefaultAgent();
    const identity = await loadAgentIdentity(agent);
    const providerKind = agent.provider || config.defaultProvider;
    const model = agent.model || config.providers[providerKind]?.model || 'unknown';

    const provider = buildProvider({ ...config, defaultProvider: providerKind as never });
    const systemPrompt = buildSystemPrompt(identity.soul, agent.systemPrompt, identity.user, identity.memory) +
      `\n\nYou are processing a swarm directive from a peer node. Agent type: ${agentType ?? 'general'}. Complete the task efficiently.`;

    await registerAllBuiltins(globalRegistry, true);

    const sessionId = `swarm_${Date.now().toString(36)}`;
    const sessionDb = await initSessionDb(sessionId);
    await createSession(sessionId, 'swarm', undefined, agent.id);

    try {
      const result = await agentTurn({
        userMessage: instruction,
        provider,
        model,
        sessionDb,
        sessionId,
        systemPrompt,
        stream: false,
        registry: globalRegistry,
        toolContext: {
          workingDir: Deno.cwd(),
          agentId: 'swarm-agent',
          workspaceDir: Deno.cwd(),
          model,
          provider: providerKind,
        },
        enableReflection: false,
        maxToolRounds: 6,
      });

      await closeSession(sessionId).catch(() => {});
      sessionDb.close();

      return {
        status: 'completed',
        output: JSON.stringify({ response: result.response }),
        metrics: {
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          costUsd: result.costUsd,
          durationMs: performance.now() - t0,
          toolCalls: 0,
        },
      };
    } catch (e) {
      await closeSession(sessionId).catch(() => {});
      sessionDb.close();
      throw e;
    }
  } catch (e) {
    return {
      status: 'failed',
      error: `Spawn agent failed: ${(e as Error).message}`,
      metrics: {
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        durationMs: performance.now() - t0,
        toolCalls: 0,
      },
    };
  }
}

async function handleExecuteTask(
  payload: Record<string, unknown>,
  t0: number,
): Promise<SwarmDirectiveResponse> {
  const command = payload.command as string | undefined;

  if (!command) {
    return { status: 'failed', error: 'execute_task directive missing command' };
  }

  try {
    const cmd = new Deno.Command(Deno.execPath(), {
      args: ['eval', command],
      stdout: 'piped',
      stderr: 'piped',
    });
    const output = await cmd.output();
    const stdout = new TextDecoder().decode(output.stdout);
    const stderr = new TextDecoder().decode(output.stderr);

    const success = output.code === 0;
    const combined = [stdout, stderr ? `\nSTDERR:\n${stderr}` : ''].filter(Boolean).join('\n');

    return {
      status: success ? 'completed' : 'failed',
      output: combined,
      error: success ? undefined : `Exit code ${output.code}`,
      metrics: {
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        durationMs: performance.now() - t0,
        toolCalls: 0,
      },
    };
  } catch (e) {
    return {
      status: 'failed',
      error: `Execute task failed: ${(e as Error).message}`,
      metrics: {
        tokensIn: 0, tokensOut: 0, costUsd: 0,
        durationMs: performance.now() - t0, toolCalls: 0,
      },
    };
  }
}

async function handleForwardMessage(
  payload: Record<string, unknown>,
  t0: number,
): Promise<SwarmDirectiveResponse> {
  const message = payload.message as string | undefined;
  const targetSessionId = payload.targetSessionId as string | undefined;

  if (!message || !targetSessionId) {
    return {
      status: 'failed',
      error: 'forward_message directive missing message or targetSessionId',
    };
  }

  try {
    const { logEvent } = await import('../../../../src/db/lens.ts');
    await logEvent({
      event_type: 'swarm_forward',
      session_id: targetSessionId,
      actor: 'swarm',
      action: 'forward_message',
      summary: `Swarm forwarded message (${message.length} chars)`,
      started_at: new Date().toISOString(),
    } as never);

    return {
      status: 'completed',
      output: JSON.stringify({ forwarded: true, targetSessionId, length: message.length }),
      metrics: {
        tokensIn: 0, tokensOut: 0, costUsd: 0,
        durationMs: performance.now() - t0, toolCalls: 0,
      },
    };
  } catch (e) {
    return {
      status: 'failed',
      error: `Forward message failed: ${(e as Error).message}`,
      metrics: {
        tokensIn: 0, tokensOut: 0, costUsd: 0,
        durationMs: performance.now() - t0, toolCalls: 0,
      },
    };
  }
}
