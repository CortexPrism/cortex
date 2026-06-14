import type { LLMProvider } from '../llm/types.ts';
import type { Message } from '../llm/types.ts';
import type { Db } from '../db/client.ts';
import { logEvent } from '../db/lens.ts';
import { incrementTurn } from '../db/sessions.ts';
import type { ToolRegistry } from '../tools/registry.ts';
import type { ToolContext } from '../tools/types.ts';
import {
  executeTool,
  formatToolResults,
  injectToolsIntoPrompt,
  parseToolCalls,
} from '../tools/executor.ts';
import type { EmbeddingProvider } from '../memory/embeddings.ts';
import { injectMemory } from '../memory/inject.ts';
import { writeEpisodic } from '../memory/store.ts';
import { reflectOnTurn, storeReflection } from './reflect.ts';
import { extractAndStoreEntities } from '../memory/graph.ts';
import { applyMetaCogPrefix, assessTask } from './metacog.ts';

const MAX_TOOL_ROUNDS = 8;

const FALLBACK_SYSTEM_PROMPT =
  'You are Cortex, an intelligent agentic assistant. Be helpful, precise, and honest.';

export interface AgentTurnOptions {
  userMessage: string;
  provider: LLMProvider;
  model: string;
  sessionDb: Db;
  sessionId: string;
  systemPrompt?: string;
  stream?: boolean;
  onChunk?: (chunk: string) => void;
  registry?: ToolRegistry;
  toolContext?: Omit<ToolContext, 'sessionId'>;
  embedder?: EmbeddingProvider;
  enableReflection?: boolean;
}

export interface AgentTurnResult {
  response: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  turnId: string;
  durationMs: number;
}

async function loadHistory(db: Db, limit = 50): Promise<Message[]> {
  const rows = await db.all<{ role: string; content: string }>(
    `SELECT role, content FROM session_messages
     WHERE role IN ('user', 'assistant')
     ORDER BY id DESC LIMIT ?`,
    [limit],
  );
  return rows.reverse().map((r) => ({
    role: r.role as 'user' | 'assistant',
    content: r.content,
  }));
}

async function persistMessage(
  db: Db,
  role: 'user' | 'assistant',
  content: string,
  tokenCount?: number,
): Promise<void> {
  await db.run(
    `INSERT INTO session_messages (role, content, token_count) VALUES (?, ?, ?)`,
    [role, content, tokenCount ?? null],
  );
}

function nanoid(): string {
  return `turn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function agentTurn(options: AgentTurnOptions): Promise<AgentTurnResult> {
  const {
    userMessage,
    provider,
    model,
    sessionDb,
    sessionId,
    systemPrompt = FALLBACK_SYSTEM_PROMPT,
    stream = true,
    onChunk,
  } = options;

  const turnId = nanoid();
  const started = Date.now();
  const startedAt = new Date(started).toISOString();

  await persistMessage(sessionDb, 'user', userMessage);

  const history = await loadHistory(sessionDb);
  const messages: Message[] = [...history];

  let response = '';
  let tokensIn = 0;
  let tokensOut = 0;
  let costUsd = 0;
  let errorMsg: string | undefined;

  const registry = options.registry;
  const toolCtx: ToolContext | undefined = registry && options.toolContext
    ? { ...options.toolContext, sessionId }
    : undefined;

  const metaAssessment = assessTask(userMessage);

  if (metaAssessment.decision === 'ask_first' && metaAssessment.requiresClarification) {
    const clarification = metaAssessment.requiresClarification;
    if (onChunk) onChunk(clarification);
    await Promise.allSettled([
      persistMessage(sessionDb, 'assistant', clarification),
      incrementTurn(sessionId),
    ]);
    return {
      response: clarification,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      turnId,
      durationMs: Date.now() - started,
    };
  }

  const memoryEnrichedPrompt = await injectMemory(
    systemPrompt,
    userMessage,
    options.embedder ?? null,
  )
    .catch(() => systemPrompt);

  const metaCogPrompt = applyMetaCogPrefix(metaAssessment, memoryEnrichedPrompt);

  const effectiveSystemPrompt = registry && toolCtx
    ? injectToolsIntoPrompt(metaCogPrompt, registry.definitions())
    : metaCogPrompt;

  try {
    let round = 0;
    let currentMessages = messages;

    while (round < MAX_TOOL_ROUNDS) {
      let roundResponse = '';

      if (stream && onChunk && round === 0) {
        for await (
          const chunk of provider.stream({
            messages: currentMessages,
            model,
            systemPrompt: effectiveSystemPrompt,
          })
        ) {
          if (!chunk.done) {
            roundResponse += chunk.delta;
            onChunk(chunk.delta);
          } else {
            tokensIn += chunk.tokensIn ?? 0;
            tokensOut += chunk.tokensOut ?? 0;
            costUsd += chunk.costUsd ?? 0;
          }
        }
      } else {
        const r = await provider.complete({
          messages: currentMessages,
          model,
          systemPrompt: effectiveSystemPrompt,
        });
        roundResponse = r.content;
        tokensIn += r.tokensIn;
        tokensOut += r.tokensOut;
        costUsd += r.costUsd;
      }

      response = roundResponse;

      if (!registry || !toolCtx) break;

      const toolCalls = parseToolCalls(roundResponse);
      if (toolCalls.length === 0) break;

      if (round > 0 || !(stream && onChunk)) {
        if (onChunk) onChunk(roundResponse);
      }

      const toolResults = await Promise.all(
        toolCalls.map((tc) => executeTool(tc, registry, toolCtx)),
      );

      const resultText = formatToolResults(toolResults);
      if (onChunk) onChunk(`\n\n${resultText}\n`);

      currentMessages = [
        ...currentMessages,
        { role: 'assistant' as const, content: roundResponse },
        { role: 'user' as const, content: resultText },
      ];

      round++;
    }
  } catch (err) {
    errorMsg = (err as Error).message;
    throw err;
  } finally {
    const durationMs = Date.now() - started;
    const episodicSummary = `User: ${userMessage.slice(0, 200)}\nAssistant: ${
      (response || '(error)').slice(0, 200)
    }`;
    await Promise.allSettled([
      persistMessage(sessionDb, 'assistant', response || '(error)', tokensOut),
      incrementTurn(sessionId),
      writeEpisodic({
        sessionId,
        summary: episodicSummary,
        importance: Math.min(1.0, 0.3 + (userMessage.length / 500)),
        embedder: options.embedder,
      }).catch(() => {}),
      extractAndStoreEntities(`${userMessage} ${response}`, sessionId).catch(() => {}),
      options.enableReflection && response
        ? reflectOnTurn(userMessage, response, provider, model)
          .then((r) => storeReflection(sessionId, r))
          .catch(() => {})
        : Promise.resolve(),
      logEvent({
        event_type: 'llm_call',
        session_id: sessionId,
        turn_id: turnId,
        actor: 'agent',
        action: 'llm_call',
        summary: userMessage.slice(0, 120),
        model,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        cost_usd: costUsd,
        started_at: startedAt,
        duration_ms: durationMs,
        error: errorMsg,
      }),
    ]);
  }

  const durationMs = Date.now() - started;
  return { response, tokensIn, tokensOut, costUsd, turnId, durationMs };
}
