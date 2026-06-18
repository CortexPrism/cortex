#!/usr/bin/env deno run --allow-all
/**
 * Sub-agent entry point.
 * Spawned by the parent agent to handle delegated tasks.
 *
 * Protocol: stdin/stdout JSON-line
 *   → {"type":"init","config":{...},"agentConfig":{...}}
 *   ← {"type":"ready"}
 *   ← {"type":"chunk","delta":"..."}
 *   ← {"type":"done","result":{...}}
 *   ← {"type":"error","error":"..."}
 */

import { agentTurn } from '../agent/loop.ts';
import { buildProvider } from '../llm/router.ts';
import { loadConfig } from '../config/config.ts';
import type { AgentConfig, ProviderKind } from '../config/config.ts';
import { buildSystemPrompt } from '../agent/soul.ts';
import { ToolRegistry } from '../tools/registry.ts';
import { buildEmbedder } from '../memory/embeddings.ts';
import { initSessionDb } from '../db/migrate.ts';
import { closeSession, createSession } from '../db/sessions.ts';
import { runMigrations } from '../db/migrate.ts';
import type { Tool } from '../tools/types.ts';

interface InitMessage {
  type: 'init';
  config: {
    id: string;
    parentSessionId: string;
    instruction: string;
    subAgentType?: string;
    config: {
      agentId?: string;
      name?: string;
      provider?: ProviderKind;
      model?: string;
      systemPrompt?: string;
      tools?: string[];
      maxTurns?: number;
      timeout?: number;
    };
  };
  agentConfig: AgentConfig;
}

function send(msg: unknown): void {
  const encoded = new TextEncoder().encode(JSON.stringify(msg) + '\n');
  Deno.stdout.writeSync(encoded);
}

async function main(): Promise<void> {
  // Read the init message from stdin
  const stdin = Deno.stdin;
  const buf = new Uint8Array(65536);
  const n = await stdin.read(buf);
  if (n === null) {
    send({ type: 'error', error: 'No init message received' });
    Deno.exit(1);
  }

  const raw = new TextDecoder().decode(buf.subarray(0, n)).trim();
  let init: InitMessage;
  try {
    init = JSON.parse(raw) as InitMessage;
  } catch (e) {
    send({ type: 'error', error: `Invalid init JSON: ${(e as Error).message}` });
    Deno.exit(1);
  }

  if (init.type !== 'init') {
    send({ type: 'error', error: `Expected init message, got ${init.type}` });
    Deno.exit(1);
  }

  const { config, agentConfig } = init;
  const taskId = config.id;
  const instruction = config.instruction;

  try {
    // Ensure migrations
    await runMigrations();

    // Load config
    const cortexConfig = await loadConfig();

    // Determine provider and model
    const providerKind = config.config.provider || agentConfig.provider ||
      cortexConfig.defaultProvider;
    const model = config.config.model || agentConfig.model ||
      cortexConfig.providers[providerKind]?.model || 'unknown';
    const reasoningEffort = cortexConfig.providers[providerKind]?.reasoningEffort;

    // Build provider
    const provider = buildProvider({
      ...cortexConfig,
      defaultProvider: providerKind as never,
    });

    // Build identity
    let soul = agentConfig.soul || '';
    let user = '';
    let memory = '';

    if (!soul && agentConfig.soulFile) {
      try {
        soul = await Deno.readTextFile(agentConfig.soulFile);
      } catch { /* ignore */ }
    }

    const systemPrompt = buildSystemPrompt(soul, config.config.systemPrompt, user, memory);

    // Build tool registry (centralized registration)
    const registry = new ToolRegistry();
    const { registerAllBuiltins } = await import('../tools/registry.ts');
    const allTools = await registerAllBuiltins(registry, false); // Exclude codegraph for sub-agents

    // Determine allowed tools from config or agent defaults
    const allowedTools = config.config.tools?.length
      ? config.config.tools
      : (agentConfig.tools?.length ? agentConfig.tools : Object.keys(allTools));

    // Filter to allowed tools if specified
    if (config.config.tools?.length || agentConfig.tools?.length) {
      // Clear registry and re-register only allowed tools
      for (const name of Object.keys(allTools)) {
        registry.unregister(name);
      }
      for (const name of allowedTools) {
        if (allTools[name]) {
          registry.register(allTools[name]);
        }
      }
    }

    const embedder = buildEmbedder(cortexConfig);

    // Create a session for this sub-task
    const sessionId = `sub_${taskId}_${Date.now().toString(36)}`;
    const sessionType = config.subAgentType ? `subagent:${config.subAgentType}` : 'subagent';
    const sessionDb = await initSessionDb(sessionId);
    await createSession(sessionId, sessionType, undefined, undefined, config.parentSessionId);

    // Signal ready
    send({ type: 'ready' });

    // Run the agent turn
    const result = await agentTurn({
      userMessage: instruction,
      provider: provider!,
      model,
      sessionDb,
      sessionId,
      systemPrompt,
      stream: true,
      reasoningEffort,
      onChunk: (delta) => send({ type: 'chunk', delta }),
      registry,
      toolContext: {
        workingDir: Deno.cwd(),
        agentId: config.config.agentId ?? agentConfig.id ?? 'default',
        workspaceDir: (await import('../workspace/paths.ts')).getAgentWorkspaceDir(
          config.config.agentId ?? config.subAgentType ?? agentConfig.id ?? 'default',
        ),
      },
      embedder,
    });

    // Close session
    await closeSession(sessionId).catch(() => {});
    sessionDb.close();

    // Send result
    send({
      type: 'done',
      result: {
        success: true,
        response: result.response,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
        durationMs: result.durationMs,
      },
    });
  } catch (e) {
    send({
      type: 'error',
      error: (e as Error).message,
    });
  }
}

main();
