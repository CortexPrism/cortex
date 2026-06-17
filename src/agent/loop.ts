import type { LLMProvider } from '../llm/types.ts';
import type { Message, ContentBlock } from '../llm/types.ts';
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
import { writeEpisodic, writeSemantic } from '../memory/store.ts';
import { appendToMemoryFile } from './soul.ts';
import { reflectOnTurn, storeReflection } from './reflect.ts';
import { extractAndStoreEntities } from '../memory/graph.ts';
import { applyMetaCogPrefix, assessTask } from './metacog.ts';
import { createPipelineContext, runHooksForStage } from '../pipeline/manager.ts';
import { cleanupSessionState, registerBuiltinHooks } from '../pipeline/builtin.ts';
import type { AgentState } from '../pipeline/types.ts';
import {
  extractSkillFromSession,
  findMatchingSkills,
  formatSkillsForPrompt,
} from '../memory/skills.ts';
import { buildNodeContextSection, injectNodeContext } from './node-context.ts';
import type { ProviderKind } from '../config/config.ts';

let builtinHooksRegistered = false;

const PREFERENCE_PATTERNS: Array<{ re: RegExp; extract: (m: RegExpMatchArray) => string; category: string }> = [
  {
    re: /(?:call|refer to|name) (?:yourself|you) (?:as )?["']?([\w\s-]{1,40})["']?/i,
    extract: (m) => `The user wants the assistant to be called "${m[1].trim()}".`,
    category: 'identity',
  },
  {
    re: /(?:i(?:'m| am)|my name(?:'s| is)) ([A-Z][\w\s]{1,30})/,
    extract: (m) => `The user's name is ${m[1].trim()}.`,
    category: 'preference',
  },
  {
    re: /(?:always|please always|i (?:prefer|want|like)) (.{10,120})/i,
    extract: (m) => `User preference: ${m[1].trim()}.`,
    category: 'preference',
  },
  {
    re: /(?:don't|do not|never|stop) (.{5,80})/i,
    extract: (m) => `User instruction: do not ${m[1].trim()}.`,
    category: 'preference',
  },
  {
    re: /(?:remember that|note that|keep in mind) (.{5,200})/i,
    extract: (m) => `User wants this remembered: ${m[1].trim()}.`,
    category: 'preference',
  },
];

async function detectAndPersistPreference(userMessage: string): Promise<void> {
  for (const { re, extract, category } of PREFERENCE_PATTERNS) {
    const m = userMessage.match(re);
    if (!m) continue;
    const content = extract(m);
    await Promise.all([
      appendToMemoryFile(`- [${category}] ${content}`),
      writeSemantic({ content, category, importance: 0.9 }),
    ]).catch(() => {});
    break;
  }
}

const DEFAULT_MAX_TOOL_ROUNDS = 8;

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
  reasoningEffort?: string;
  userContentBlocks?: ContentBlock[];
  /**
   * Maximum tool-call rounds before the loop is halted.
   * Defaults to 8. Callers running long research, monitoring, or
   * multi-phase tasks can raise this per-request.
   */
  maxToolRounds?: number;
  /**
   * Number of most-recent messages to always include as the causal
   * anchor window. Defaults to 20.
   */
  historyRecencyWindow?: number;
  /**
   * How many semantically relevant older messages (beyond the recency
   * window) to surface via keyword search. Set to 0 to disable.
   * Defaults to 5.
   */
  historySemanticK?: number;
}

export interface AgentTurnResult {
  response: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  turnId: string;
  durationMs: number;
  /** True when the loop was halted at maxToolRounds with work still in progress. */
  hitToolCeiling?: boolean;
}

async function loadHybridHistory(
  db: Db,
  query: string,
  recencyWindow = 20,
  semanticK = 5,
): Promise<Message[]> {
  // ── 1. Causal anchor: the most recent N messages (always included, in order) ──
  const recentRows = await db.all<{ id: number; role: string; content: string }>(
    `SELECT id, role, content FROM session_messages
     WHERE role IN ('user', 'assistant')
     ORDER BY id DESC LIMIT ?`,
    [recencyWindow],
  );
  recentRows.reverse();
  const recentIds = new Set(recentRows.map((r) => r.id));
  const oldestRecentId = recentRows.length > 0 ? recentRows[0].id : Number.MAX_SAFE_INTEGER;

  // ── 2. Semantic supplement: keyword-search older messages beyond the window ──
  let supplementBlock = '';
  if (semanticK > 0 && oldestRecentId > 1) {
    const terms = query
      .replace(/["'\-*()]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4)
      .slice(0, 8)
      .join(' ');

    if (terms.length > 0) {
      const oldRows = await db.all<{ id: number; role: string; content: string; created_at: string }>(
        `SELECT id, role, content, created_at FROM session_messages
         WHERE role IN ('user', 'assistant')
           AND id < ?
           AND content LIKE ?
         ORDER BY id DESC LIMIT ?`,
        [oldestRecentId, `%${terms.split(' ')[0]}%`, semanticK * 4],
      );

      // Score by number of query terms found, pick top semanticK
      const scored = oldRows
        .filter((r) => !recentIds.has(r.id))
        .map((r) => {
          const lower = r.content.toLowerCase();
          const hits = terms.split(' ').filter((t) => lower.includes(t)).length;
          return { ...r, hits };
        })
        .filter((r) => r.hits > 0)
        .sort((a, b) => b.hits - a.hits || b.id - a.id)
        .slice(0, semanticK)
        .sort((a, b) => a.id - b.id); // restore chronological order

      if (scored.length > 0) {
        const lines = scored.map((r) => {
          const ts = r.created_at ? ` (${r.created_at.slice(0, 16)})` : '';
          const preview = r.content.slice(0, 600);
          return `[turn-${r.id} · ${r.role}${ts}]: ${preview}`;
        });
        supplementBlock =
          `[Relevant earlier context retrieved from this session — treat as background, not the live conversation thread]
${lines.join('\n\n')}
[End of earlier context]`;
      }
    }
  }

  // ── 3. Assemble: supplement injected as a system-style user message before recency window ──
  const messages: Message[] = [];
  if (supplementBlock) {
    messages.push({ role: 'user' as const, content: supplementBlock });
    messages.push({
      role: 'assistant' as const,
      content: 'Understood. I have noted the earlier context above.',
    });
  }
  for (const r of recentRows) {
    messages.push({ role: r.role as 'user' | 'assistant', content: r.content });
  }
  return messages;
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
  if (!builtinHooksRegistered) {
    registerBuiltinHooks();
    // Register voice auto-TTS hook
    try {
      const { registerVoicePipelineHook } = await import('../voice/pipeline.ts');
      registerVoicePipelineHook();
    } catch {
      // Voice module not loaded — not a fatal error
    }
    builtinHooksRegistered = true;
  }

  // Load config for MQM (cached, cheap after first call)
  const { loadConfig } = await import('../config/config.ts');
  const config = await loadConfig();

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

  let effectiveInput = userMessage;

  const state: AgentState = {
    sessionId,
    turnId,
    tokensUsed: 0,
    costUsd: 0,
    toolCallsMade: 0,
    startedAt,
    userMessage,
    model,
  };

  let preAssessCtx = createPipelineContext({
    stage: 'pre-assess',
    sessionId,
    turnId,
    state,
    input: userMessage,
    messages: [],
  });

  const preAssessResult = await runHooksForStage('pre-assess', preAssessCtx);
  if (preAssessResult.aborted) {
    return {
      response: preAssessResult.abortMessage || 'Request blocked',
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      turnId,
      durationMs: Date.now() - started,
    };
  }
  effectiveInput = preAssessCtx.input ?? effectiveInput;

  await persistMessage(sessionDb, 'user', effectiveInput);

  import('../quartermaster/mod.ts').then(({ recordUserMessage }) => {
    recordUserMessage(sessionId, effectiveInput);
  }).catch(() => {});

  const recencyWindow = options.historyRecencyWindow ?? 20;
  const semanticK = options.historySemanticK ?? 5;
  const history = await loadHybridHistory(sessionDb, effectiveInput, recencyWindow, semanticK);
  const messages: Message[] = [...history];

  if (
    options.userContentBlocks &&
    options.userContentBlocks.length > 0 &&
    messages.length > 0 &&
    messages[messages.length - 1].role === 'user'
  ) {
    messages[messages.length - 1] = {
      role: 'user',
      content: options.userContentBlocks,
    };
  }

  const maxToolRounds = options.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;

  let response = '';
  let tokensIn = 0;
  let tokensOut = 0;
  let costUsd = 0;
  let errorMsg: string | undefined;
  let hitToolCeiling = false;

  const registry = options.registry;
  const toolCtx: ToolContext | undefined = registry && options.toolContext
    ? { ...options.toolContext, sessionId }
    : undefined;

  const metaAssessment = assessTask(effectiveInput);

  const postAssessCtx = createPipelineContext({
    stage: 'post-assess',
    sessionId,
    turnId,
    state: { ...state, tokensUsed: tokensIn + tokensOut, costUsd },
    input: effectiveInput,
    assessment: metaAssessment,
    messages,
  });
  const postAssessResult = await runHooksForStage('post-assess', postAssessCtx);
  if (postAssessResult.aborted) {
    return {
      response: postAssessResult.abortMessage || 'Request blocked',
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      turnId,
      durationMs: Date.now() - started,
    };
  }

  if (metaAssessment.decision === 'ask_first' && metaAssessment.requiresClarification) {
    const clarification = metaAssessment.requiresClarification;

    const preOutputCtx = createPipelineContext({
      stage: 'pre-output',
      sessionId,
      turnId,
      state: { ...state, tokensUsed: 0, costUsd: 0 },
      output: clarification,
    });
    const preOutputResult = await runHooksForStage('pre-output', preOutputCtx);
    if (preOutputResult.aborted) {
      return {
        response: preOutputResult.abortMessage || 'Request blocked',
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        turnId,
        durationMs: Date.now() - started,
      };
    }

    if (onChunk) onChunk(preOutputCtx.output ?? clarification);
    await Promise.allSettled([
      persistMessage(sessionDb, 'assistant', preOutputCtx.output ?? clarification),
      incrementTurn(sessionId),
      runHooksForStage(
        'post-output',
        createPipelineContext({
          stage: 'post-output',
          sessionId,
          turnId,
          state: { ...state, tokensUsed: 0, costUsd: 0 },
          output: preOutputCtx.output ?? clarification,
        }),
      ),
    ]);
    return {
      response: preOutputCtx.output ?? clarification,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      turnId,
      durationMs: Date.now() - started,
    };
  }

  const memoryEnrichedPrompt = await injectMemory(
    systemPrompt,
    effectiveInput,
    options.embedder ?? null,
  )
    .catch(() => systemPrompt);

  let skillEnrichedPrompt = memoryEnrichedPrompt;
  try {
    const skills = await findMatchingSkills(effectiveInput, 3);
    const reliable = skills.filter((s) => s.origin === 'human' || s.success_rate >= 0.3);
    if (reliable.length > 0) {
      skillEnrichedPrompt = memoryEnrichedPrompt + formatSkillsForPrompt(reliable);
    }
  } catch { /* skills query may fail */ }

  const metaCogPrompt = applyMetaCogPrefix(metaAssessment, skillEnrichedPrompt);

  const effectiveSystemPrompt = registry && toolCtx
    ? injectToolsIntoPrompt(metaCogPrompt, registry.definitions())
    : metaCogPrompt;

  const nodeSection = await buildNodeContextSection().catch(() => null);
  const nodeAwareSystemPrompt = injectNodeContext(effectiveSystemPrompt, nodeSection);

  // ── Model Quartermaster: predict model before LLM call ──
  let effectiveProvider = provider;
  let effectiveModel = model;
  let mqmPredictedProviderKind: string | undefined;

  if (config?.modelSelection?.enabled) {
    const mqmPreLlmCtx = createPipelineContext({
      stage: 'pre-llm',
      sessionId,
      turnId,
      state: { ...state, tokensUsed: tokensIn + tokensOut, costUsd },
      input: effectiveInput,
      assessment: metaAssessment,
    });
    const mqmPreLlmResult = await runHooksForStage('pre-llm', mqmPreLlmCtx);
    if (mqmPreLlmResult.aborted) {
      return {
        response: mqmPreLlmResult.abortMessage || 'Request blocked',
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        turnId,
        durationMs: Date.now() - started,
      };
    }

    // Check for MQM prediction from hook
    const predictedState = mqmPreLlmCtx.state as Record<string, unknown>;
    mqmPredictedProviderKind = predictedState.mqmPredictedProvider as string | undefined;
    if (
      predictedState.mqmPredictionMode === 'enforce' &&
      typeof predictedState.mqmPredictedProvider === 'string' &&
      typeof predictedState.mqmPredictedModel === 'string'
    ) {
      try {
        const { buildProviderFromConfig } = await import('../llm/router.ts');
        const { loadConfig: lc } = await import('../config/config.ts');
        const cfg = await lc();
        const predictedProvider = predictedState.mqmPredictedProvider as ProviderKind;
        const predictedModel = predictedState.mqmPredictedModel as string;
        const providerCfg = cfg.providers[predictedProvider];
        if (providerCfg) {
          effectiveProvider = buildProviderFromConfig(predictedProvider, providerCfg);
          effectiveModel = predictedModel;
          if (state.mqmPredictionConfidence) {
            console.log(
              `  🎯 MQM: Using ${predictedProvider}/${predictedModel} (confidence: ${
                (predictedState.mqmPredictionConfidence as number).toFixed(2)
              })`,
            );
          }
        }
      } catch {
        // Provider build failed, fall through to default
      }
    }
  }

  function stripToolCallMarkup(text: string): string {
    // Remove <tool_call>...</tool_call> blocks
    let out = text.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '');

    // Remove bare JSON tool calls using a brace-depth walker so nested args
    // like {"tool":"x","args":{"path":"..."}} are fully consumed.
    const bareToolRe = /\{\s*"(tool|name)"\s*:/g;
    let bm: RegExpExecArray | null;
    const regions: Array<[number, number]> = [];
    while ((bm = bareToolRe.exec(out)) !== null) {
      const start = bm.index;
      let depth = 0;
      let inStr = false;
      let esc = false;
      let end = -1;
      for (let i = start; i < out.length; i++) {
        const ch = out[i];
        if (esc) { esc = false; continue; }
        if (ch === '\\') { esc = true; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === '{') depth++;
        if (ch === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
      }
      if (end > start) regions.push([start, end]);
    }
    // Remove matched regions right-to-left so indices stay valid
    for (let i = regions.length - 1; i >= 0; i--) {
      out = out.slice(0, regions[i][0]) + out.slice(regions[i][1]);
    }

    // Remove fenced code blocks that contain tool call JSON
    out = out.replace(/```[\s\S]*?```/g, (block) => {
      return /\{\s*"(tool|name)"\s*:/.test(block) ? '' : block;
    });

    return out.replace(/\n{3,}/g, '\n\n').trim();
  }

  const collectedToolCalls: Array<
    { tool: string; params: Record<string, unknown>; result: string }
  > = [];

  const SENSITIVE_KEYS = /^(api_?key|token|secret|password|auth|credential|private_?key)$/i;
  function redactParams(params: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params)) {
      out[k] = SENSITIVE_KEYS.test(k) ? '[REDACTED]' : v;
    }
    return out;
  }

  try {
    let round = 0;
    let currentMessages = messages;
    console.log(`[loop] turn=${turnId} tools=${registry ? 'yes' : 'no'} stream=${stream}`);

    while (round < maxToolRounds) {
      let roundResponse = '';

      const preReasonCtx = createPipelineContext({
        stage: 'pre-reason',
        sessionId,
        turnId,
        state: { ...state, tokensUsed: tokensIn + tokensOut, costUsd },
        messages: currentMessages,
      });
      const preReasonResult = await runHooksForStage('pre-reason', preReasonCtx);
      if (preReasonResult.aborted) {
        return {
          response: preReasonResult.abortMessage || 'Request blocked',
          tokensIn,
          tokensOut,
          costUsd,
          turnId,
          durationMs: Date.now() - started,
        };
      }

      // When tools are registered we always stream internally and buffer the full
      // response before forwarding anything to the client.  This prevents
      // complete() from hanging on slow providers and lets us inspect the response
      // for tool calls before any output reaches the user.
      // When no tools are registered we can stream directly to the client.
      const hasTools = !!(registry && toolCtx);
      const useDirectStream = stream && onChunk && !hasTools;
      console.log(`[loop] round=${round} hasTools=${hasTools} useDirectStream=${useDirectStream}`);

      if (useDirectStream) {
        for await (
          const chunk of effectiveProvider.stream({
            messages: currentMessages,
            model: effectiveModel,
            systemPrompt: nodeAwareSystemPrompt,
            reasoningEffort: options.reasoningEffort,
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
        // Buffer via streaming — avoids complete() hanging on slow/large contexts.
        // A 90-second AbortSignal prevents indefinite stalls on slow providers.
        const abortCtrl = new AbortController();
        const abortTimer = setTimeout(() => abortCtrl.abort(), 90_000);
        try {
          for await (
            const chunk of effectiveProvider.stream({
              messages: currentMessages,
              model: effectiveModel,
              systemPrompt: nodeAwareSystemPrompt,
              reasoningEffort: options.reasoningEffort,
              signal: abortCtrl.signal,
            })
          ) {
            if (!chunk.done) {
              roundResponse += chunk.delta;
            } else {
              tokensIn += chunk.tokensIn ?? 0;
              tokensOut += chunk.tokensOut ?? 0;
              costUsd += chunk.costUsd ?? 0;
            }
          }
        } finally {
          clearTimeout(abortTimer);
        }
      }

      response = roundResponse;
      console.log(`[loop] round=${round} responseLen=${roundResponse.length} preview=${JSON.stringify(roundResponse.slice(0, 120))}`);

      const postReasonCtx = createPipelineContext({
        stage: 'post-reason',
        sessionId,
        turnId,
        state: { ...state, tokensUsed: tokensIn + tokensOut, costUsd },
        messages: currentMessages,
        currentLLMResponse: roundResponse,
      });
      const postReasonResult = await runHooksForStage('post-reason', postReasonCtx);
      if (postReasonResult.aborted) {
        return {
          response: postReasonResult.abortMessage || 'Request blocked',
          tokensIn,
          tokensOut,
          costUsd,
          turnId,
          durationMs: Date.now() - started,
        };
      }
      roundResponse = postReasonCtx.currentLLMResponse ?? roundResponse;
      response = roundResponse;

      if (!registry || !toolCtx) break;

      const toolCalls = parseToolCalls(roundResponse);
      console.log(`[loop] round=${round} toolCallsFound=${toolCalls.length} names=${toolCalls.map((t) => t.toolName).join(',')}`);
      if (toolCalls.length === 0) {
        // No tool calls — this is the final clean response.  If we buffered
        // (didn't stream above), emit it now so the user sees something.
        console.log(`[loop] round=${round} final clean response — emitting via onChunk=${!!onChunk} useDirectStream=${useDirectStream}`);
        if (!useDirectStream && onChunk) onChunk(roundResponse);
        break;
      }

      // Has tool calls — emit the prose portion only (strip raw JSON/XML).
      if (onChunk) {
        const proseOnly = stripToolCallMarkup(roundResponse);
        console.log(`[loop] round=${round} emitting prose (len=${proseOnly.length}) stripped from tool-call response`);
        if (proseOnly.trim()) onChunk(proseOnly);
      }

      const toolResults = [];
      for (const tc of toolCalls) {
        const preToolCtx = createPipelineContext({
          stage: 'pre-tool',
          sessionId,
          turnId,
          state: {
            ...state,
            tokensUsed: tokensIn + tokensOut,
            costUsd,
            toolCallsMade: toolResults.length,
          },
          toolCall: tc,
        });
        const preToolResult = await runHooksForStage('pre-tool', preToolCtx);
        if (preToolResult.aborted) {
          toolResults.push({
            toolName: tc.toolName,
            success: false,
            output: '',
            error: preToolResult.abortMessage || 'Tool execution blocked by hook',
            durationMs: 0,
          });
          continue;
        }

        console.log(`[loop] executing tool=${tc.toolName} args=${JSON.stringify(tc.args).slice(0, 120)}`);
        const result = await executeTool(tc, registry, toolCtx);
        console.log(`[loop] tool=${tc.toolName} success=${result.success} outputLen=${result.output.length} error=${result.error ?? ''}`);
        state.toolCallsMade++;

        const postToolCtx = createPipelineContext({
          stage: 'post-tool',
          sessionId,
          turnId,
          state: {
            ...state,
            tokensUsed: tokensIn + tokensOut,
            costUsd,
            toolCallsMade: state.toolCallsMade,
          },
          toolCall: tc,
          toolResult: result,
        });
        await runHooksForStage('post-tool', postToolCtx);

        toolResults.push(result);
        collectedToolCalls.push({
          tool: tc.toolName,
          params: redactParams(tc.args),
          result: result.output || result.error || '',
        });
      }

      const resultText = formatToolResults(toolResults);
      // Tool results are internal context fed back to the LLM — never send raw
      // XML to the client UI.

      const roundsLeft = maxToolRounds - round - 1;
      const followUpInstruction = roundsLeft <= 1
        ? `${resultText}\n\nYou have used ${round + 1} of ${maxToolRounds} allowed tool rounds. Provide your final response now. If the task is genuinely incomplete, summarise what has been done and what remains so it can be continued in the next turn.`
        : `${resultText}\n\nBased on the tool output above, provide your complete response to the user. Only call another tool if the current output is genuinely insufficient — prefer summarising what you have.`;

      currentMessages = [
        ...currentMessages,
        { role: 'assistant' as const, content: roundResponse },
        { role: 'user' as const, content: followUpInstruction },
      ];

      console.log(`[loop] round=${round} done — advancing to round ${round + 1}`);
      round++;
    }
    if (round >= maxToolRounds && response === '') {
      hitToolCeiling = true;
      console.log(`[loop] hit tool ceiling at round=${round}/${maxToolRounds}`);
    }
    console.log(`[loop] exited while loop at round=${round} responseLen=${response.length}`);
  } catch (err) {
    errorMsg = (err as Error).message;
    throw err;
  } finally {
    const finalState: AgentState = {
      ...state,
      tokensUsed: tokensIn + tokensOut,
      costUsd,
      toolCallsMade: state.toolCallsMade,
    };

    // ── Model Quartermaster: record observation after LLM call ──
    if (config?.modelSelection?.enabled) {
      const { buildRequestContext } = await import('../model-quartermaster/mod.ts');
      const mqmReqCtx = buildRequestContext(
        userMessage,
        metaAssessment,
        [],
        0,
      );
      const mqmDurationMs = Date.now() - started;
      // Simple quality heuristic: longer response = higher quality
      const mqmQualityScore = response && response.length > 100
        ? Math.min(0.7 + (response.length / 5000), 1.0)
        : 0.3;

      const mqmState = { ...finalState } as Record<string, unknown>;
      mqmState.mqmRequestContext = mqmReqCtx;
      mqmState.mqmModelUsed = {
        provider: mqmPredictedProviderKind ?? config.defaultProvider,
        model: effectiveModel,
      };
      mqmState.mqmConfidence = mqmQualityScore;
      mqmState.mqmQualityScore = mqmQualityScore;
      mqmState.mqmDurationMs = mqmDurationMs;
      mqmState.mqmError = errorMsg;

      const mqmPostLlmCtx = createPipelineContext({
        stage: 'post-llm',
        sessionId,
        turnId,
        state: mqmState as unknown as AgentState,
        output: response || '(error)',
      });
      runHooksForStage('post-llm', mqmPostLlmCtx).catch(() => {});
    }

    const preOutputCtx = createPipelineContext({
      stage: 'pre-output',
      sessionId,
      turnId,
      state: finalState,
      output: response || '(error)',
    });
    const preOutputResult = await runHooksForStage('pre-output', preOutputCtx);
    let finalOutput = response || '(error)';
    if (preOutputResult.aborted) {
      finalOutput = preOutputResult.abortMessage || 'Request blocked';
    } else {
      finalOutput = preOutputCtx.output ?? finalOutput;
    }

    const durationMs = Date.now() - started;
    const episodicSummary = `User: ${userMessage.slice(0, 200)}\nAssistant: ${
      (response || '(error)').slice(0, 200)
    }`;
    await Promise.allSettled([
      persistMessage(sessionDb, 'assistant', finalOutput, tokensOut),
      incrementTurn(sessionId),
      writeEpisodic({
        sessionId,
        summary: episodicSummary,
        importance: Math.min(1.0, 0.3 + (userMessage.length / 500)),
        embedder: options.embedder,
      }).catch(() => {}),
      extractAndStoreEntities(`${userMessage} ${response}`, sessionId).catch(() => {}),
      detectAndPersistPreference(userMessage).catch(() => {}),
      options.enableReflection && response
        ? reflectOnTurn(
          userMessage,
          response,
          effectiveProvider,
          effectiveModel,
          options.reasoningEffort,
        )
          .then(async (r) => {
            await storeReflection(sessionId, r);
            // Feed reflection back into QM so wasCorrect gets resolved
            if (collectedToolCalls.length > 0) {
              const { learn } = await import('../quartermaster/mod.ts');
              learn({
                sessionId,
                turnId,
                reflection: r,
                actualToolCalls: collectedToolCalls.map((t) => t.tool),
              }).catch(() => {});
            }
          })
          .catch(() => {})
        : Promise.resolve(),
      logEvent({
        event_type: 'llm_call',
        session_id: sessionId,
        turn_id: turnId,
        actor: 'agent',
        action: 'llm_call',
        summary: userMessage.slice(0, 120),
        model: effectiveModel,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        cost_usd: costUsd,
        started_at: startedAt,
        duration_ms: durationMs,
        error: errorMsg,
      }),
    ]);

    if (collectedToolCalls.length >= 2) {
      extractSkillFromSession(
        sessionId,
        userMessage.slice(0, 300),
        collectedToolCalls,
        provider,
        model,
      ).catch(() => {});
    }

    await runHooksForStage(
      'post-output',
      createPipelineContext({
        stage: 'post-output',
        sessionId,
        turnId,
        state: finalState,
        output: finalOutput,
      }),
    );

    cleanupSessionState(sessionId);
  }

  const durationMs = Date.now() - started;
  return { response, tokensIn, tokensOut, costUsd, turnId, durationMs, hitToolCeiling };
}
