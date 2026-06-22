/**
 * Kernel Turn — OS-level orchestration layer that wraps agent execution.
 *
 * The kernel loop sits BETWEEN the caller (CLI chat, API handler, WebSocket)
 * and the agent loop (src/agent/loop.ts). It handles:
 *
 *   1. Memory injection coordination (kernel concern)
 *   2. History loading (kernel concern)
 *   3. Pipeline hook registration & execution (kernel concern)
 *   4. Tool validation coordination (kernel concern)
 *   5. Resource accounting & token tracking (kernel concern)
 *   6. Session lifecycle (kernel concern)
 *
 * The agent loop handles:
 *   1. LLM interaction (user concern)
 *   2. Tool parsing (user concern)
 *   3. Response formatting (user concern)
 *   4. Reflection (user concern)
 */
import type { LLMProvider } from '../../../../src/llm/types.ts';
import type { ContentBlock, Message } from '../../../../src/llm/types.ts';
import type { Db } from '../../../../src/db/client.ts';
import type { ToolRegistry } from '../../../../src/tools/registry.ts';
import type { ToolContext } from '../../../../src/tools/types.ts';
import type { EmbeddingProvider } from '../../../../src/memory/embeddings.ts';
import { kernel } from './mod.ts';

// Re-export agentTurnOptions and result from agent loop
export type { AgentTurnOptions, AgentTurnResult } from '../../../../src/agent/loop.ts';

// ── Kernel Turn Options ──────────────────────────────────────

export interface KernelTurnOptions {
  userMessage: string;
  provider: LLMProvider;
  model: string;
  sessionDb: Db;
  sessionId: string;
  agentId: string;
  systemPrompt?: string;
  stream?: boolean;
  onChunk?: (chunk: string) => void;
  registry?: ToolRegistry;
  toolContext?: Omit<ToolContext, 'sessionId'>;
  embedder?: EmbeddingProvider;
  enableReflection?: boolean;
  reasoningEffort?: string;
  maxToolRounds?: number;
  signal?: AbortSignal;
  // Additional kernel-level options
  userContentBlocks?: ContentBlock[];
  persistUserMessage?: boolean;
  persistAssistantMessage?: boolean;
  historyRecencyWindow?: number;
  historySemanticK?: number;
}

export interface KernelTurnResult {
  response: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  turnId: string;
  durationMs: number;
  toolCallsMade?: number;
  hitToolCeiling?: boolean;
}

// ── Kernel Turn ──────────────────────────────────────────────

/**
 * Kernel-orchestrated agent turn. Registers the turn with the OS kernel,
 * dispatches to the agent loop, and records resource usage.
 */
export async function kernelTurn(opts: KernelTurnOptions): Promise<KernelTurnResult> {
  const t0 = performance.now();

  // Register this as a kernel-tracked operation
  kernel.recordToolCall(
    {
      sessionId: opts.sessionId,
      agentId: opts.agentId,
      role: 'agent',
      pid: Deno.pid,
      parentPid: 0,
    },
    0,
  );

  // Dispatch to the agent loop (user-space execution)
  const { agentTurn } = await import('../../../../src/agent/loop.ts');
  const result = await agentTurn({
    userMessage: opts.userMessage,
    provider: opts.provider,
    model: opts.model,
    sessionDb: opts.sessionDb,
    sessionId: opts.sessionId,
    systemPrompt: opts.systemPrompt,
    stream: opts.stream,
    onChunk: opts.onChunk,
    registry: opts.registry,
    toolContext: opts.toolContext,
    embedder: opts.embedder,
    enableReflection: opts.enableReflection,
    reasoningEffort: opts.reasoningEffort,
    maxToolRounds: opts.maxToolRounds,
    signal: opts.signal,
    userContentBlocks: opts.userContentBlocks,
    persistUserMessage: opts.persistUserMessage,
    persistAssistantMessage: opts.persistAssistantMessage,
    historyRecencyWindow: opts.historyRecencyWindow,
    historySemanticK: opts.historySemanticK,
  });

  // Record token usage in the kernel for resource accounting
  kernel.recordTokens(opts.agentId, result.tokensIn, result.tokensOut, result.costUsd);

  // Record the tool call duration
  const elapsed = performance.now() - t0;
  kernel.recordToolCall(
    {
      sessionId: opts.sessionId,
      agentId: opts.agentId,
      role: 'agent',
      pid: Deno.pid,
      parentPid: 0,
    },
    elapsed,
  );

  return result;
}

// ── Kernel Turn (Streaming Generator) ───────────────────────

export async function* kernelTurnStream(
  opts: KernelTurnOptions,
): AsyncIterable<
  { type: 'chunk'; delta: string } | { type: 'done'; result: KernelTurnResult } | {
    type: 'error';
    error: string;
  }
> {
  const t0 = performance.now();

  kernel.recordToolCall(
    {
      sessionId: opts.sessionId,
      agentId: opts.agentId,
      role: 'agent',
      pid: Deno.pid,
      parentPid: 0,
    },
    0,
  );

  let response = '';
  let onChunkCb: ((chunk: string) => void) | undefined;

  if (opts.stream && opts.onChunk) {
    onChunkCb = (chunk: string) => {
      response += chunk;
      opts.onChunk!(chunk);
    };
  }

  try {
    const { agentTurn } = await import('../../../../src/agent/loop.ts');
    const result = await agentTurn({
      userMessage: opts.userMessage,
      provider: opts.provider,
      model: opts.model,
      sessionDb: opts.sessionDb,
      sessionId: opts.sessionId,
      systemPrompt: opts.systemPrompt,
      stream: opts.stream,
      onChunk: onChunkCb || opts.onChunk,
      registry: opts.registry,
      toolContext: opts.toolContext,
      embedder: opts.embedder,
      enableReflection: opts.enableReflection,
      reasoningEffort: opts.reasoningEffort,
      maxToolRounds: opts.maxToolRounds,
      signal: opts.signal,
      userContentBlocks: opts.userContentBlocks,
      persistUserMessage: opts.persistUserMessage,
      persistAssistantMessage: opts.persistAssistantMessage,
      historyRecencyWindow: opts.historyRecencyWindow,
      historySemanticK: opts.historySemanticK,
    });

    kernel.recordTokens(opts.agentId, result.tokensIn, result.tokensOut, result.costUsd);
    const elapsed = performance.now() - t0;
    kernel.recordToolCall(
      {
        sessionId: opts.sessionId,
        agentId: opts.agentId,
        role: 'agent',
        pid: Deno.pid,
        parentPid: 0,
      },
      elapsed,
    );

    yield { type: 'done', result };
  } catch (e) {
    yield { type: 'error', error: (e as Error).message };
  }
}
