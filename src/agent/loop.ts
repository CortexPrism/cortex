import { logger } from '../utils/logger.ts';
import type { LLMProvider } from '../llm/types.ts';
import type { ContentBlock, Message } from '../llm/types.ts';
import type { Db } from '../db/client.ts';
import { logEvent } from '../db/lens.ts';
import { incrementTurn } from '../db/sessions.ts';
import type { ToolRegistry } from '../tools/registry.ts';
import type { ToolContext } from '../tools/types.ts';
import type { ToolCallRequest } from '../tools/types.ts';
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
import { adversarialReflection, reflectOnTurn, storeReflection } from './reflect.ts';
import { extractAndStoreEntities } from '../memory/graph.ts';
import { applyMetaCogPrefix, assessTask } from './metacog.ts';
import { logPlan } from './planner.ts';
import { detectGoalDrift, getSessionGoal, setSessionGoal } from './drift-detector.ts';
import { createPipelineContext, runHooksForStage } from '../pipeline/manager.ts';
import { cleanupSessionState, registerBuiltinHooks } from '../pipeline/builtin.ts';
import type { AgentState } from '../pipeline/types.ts';
import {
  extractSkillFromSession,
  filterReliableSkills,
  findMatchingSkills,
  formatSkillsForPrompt,
} from '../memory/skills.ts';
import { buildNodeContextSection, injectNodeContext } from './node-context.ts';
import type { ProviderKind } from '../config/config.ts';
import {
  generationCreate,
  isConfigured as langfuseConfigured,
  spanCreate,
  spanUpdate,
  traceCreate,
} from '../observability/langfuse.ts';

const _log = logger('agent:loop');

let builtinHooksRegistered = false;

const PREFERENCE_PATTERNS: Array<
  { re: RegExp; extract: (m: RegExpMatchArray) => string; category: string }
> = [
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

const DEFAULT_MAX_TOOL_ROUNDS = 12;

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
  topP?: number;
  repetitionPenalty?: number;
  searchRecencyFilter?: string;
  returnCitations?: boolean;
  returnImages?: boolean;
  httpReferer?: string;
  xTitle?: string;
  numCtx?: number;
  numThread?: number;
  keepAlive?: string;
  dropParams?: boolean;
  includeVeniceSystemPrompt?: boolean;
  persistUserMessage?: boolean;
  persistAssistantMessage?: boolean;
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
  toolCallsMade?: number;
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
      const oldRows = await db.all<
        { id: number; role: string; content: string; created_at: string }
      >(
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
  const turnId = nanoid();
  const started = Date.now();
  const startedAt = new Date(started).toISOString();

  _log.info(`Agent turn starting`, {
    turnId,
    sessionId: options.sessionId,
    messageLength: options.userMessage.length,
  });

  if (!builtinHooksRegistered) {
    _log.debug(`Registering builtin hooks`, { turnId });
    registerBuiltinHooks();
    // Register voice auto-TTS hook
    try {
      const { registerVoicePipelineHook } = await import('../voice/pipeline.ts');
      registerVoicePipelineHook();
      _log.debug(`Voice pipeline hook registered`, { turnId });
    } catch {
      // Voice module not loaded — not a fatal error
      _log.debug(`Voice module not available`, { turnId });
    }
    builtinHooksRegistered = true;
  }

  // Load config for MQM (cached, cheap after first call)
  const { loadConfig } = await import('../config/config.ts');
  const config = await loadConfig();
  _log.debug(`Config loaded`, { turnId, hasModelSelection: !!config?.modelSelection?.enabled });

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

  _log.debug(`Running pre-assess hooks`, { turnId });
  const preAssessResult = await runHooksForStage('pre-assess', preAssessCtx);
  if (preAssessResult.aborted) {
    _log.warn(`Pre-assess aborted`, { turnId, reason: preAssessResult.abortMessage });
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
  _log.debug(`Pre-assess completed`, { turnId, inputModified: effectiveInput !== userMessage });

  if (options.persistUserMessage !== false) {
    await persistMessage(sessionDb, 'user', effectiveInput);
  }

  import('../quartermaster/mod.ts').then(({ recordUserMessage }) => {
    recordUserMessage(sessionId, effectiveInput);
  }).catch(() => {});

  const recencyWindow = options.historyRecencyWindow ?? 20;
  const semanticK = options.historySemanticK ?? 5;
  _log.debug(`Loading history`, { turnId, recencyWindow, semanticK });
  const history = await loadHybridHistory(sessionDb, effectiveInput, recencyWindow, semanticK);
  const messages: Message[] = [...history];
  _log.debug(`History loaded`, {
    turnId,
    historyLength: history.length,
    totalMessages: messages.length,
  });

  const hasDocumentContext = messages.some((message) => {
    const content = typeof message.content === 'string'
      ? message.content
      : message.content
        .map((block) => block.type === 'text' ? block.text : block.type)
        .join(' ');
    return /=== BEGIN DOCUMENT:|=== END DOCUMENT:|\[File:|file_read\(|Document\(s\) uploaded/i.test(
      content,
    );
  });

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
    _log.debug(`Applied user content blocks`, {
      turnId,
      blockCount: options.userContentBlocks.length,
    });
  }

  const maxToolRounds = options.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;
  const overallTimeout = 300_000; // 5 minutes absolute timeout
  const overallTimer = setTimeout(() => {
    _log.error(`Agent turn timed out after 5 minutes`, { turnId, sessionId });
    throw new Error('Agent turn timed out after 5 minutes - please try a simpler request');
  }, overallTimeout);

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
  _log.debug(`Starting main loop`, {
    turnId,
    maxToolRounds,
    hasTools: !!registry,
    hasToolCtx: !!toolCtx,
  });

  const metaAssessment = assessTask(effectiveInput, { hasDocumentContext });

  if (metaAssessment.escalated) {
    import('../db/lens.ts').then(({ logEvent }) => {
      logEvent({
        event_type: 'escalation',
        session_id: sessionId,
        actor: 'metacognition',
        action: 'confidence_escalation',
        started_at: new Date().toISOString(),
        summary: metaAssessment.escalationReason ?? 'Auto-escalated due to low confidence',
        payload: {
          fromDecision: 'direct',
          toDecision: 'ask_first',
          confidence: metaAssessment.confidence,
          signalBreakdown: metaAssessment.signalBreakdown,
          originalReason: metaAssessment.reason,
        },
      }).catch(() => {});
    });
  }

  logPlan({
    sessionId,
    turnId,
    decision: metaAssessment.decision,
    reason: metaAssessment.reason,
    suggestedPrefix: metaAssessment.suggestedPrefix,
    suggestedSubAgents: metaAssessment.suggestedSubAgents,
    confidence: metaAssessment.confidence,
    signalBreakdown: metaAssessment.signalBreakdown,
    policyChecked: false,
    policyViolations: [],
  });

  const prevGoal = getSessionGoal(sessionId);
  const drift = detectGoalDrift(sessionId, turnId, effectiveInput, prevGoal);
  setSessionGoal(sessionId, effectiveInput);
  if (drift.driftScore >= 0.4) {
    state.goalDrift = { detected: true, score: drift.driftScore, previousGoal: prevGoal };
  }

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
    const skills = await findMatchingSkills(effectiveInput, 3, options.embedder ?? null);
    const reliable = filterReliableSkills(skills);
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
            _log.info(
              `MQM: Using ${predictedProvider}/${predictedModel} (confidence: ${
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
        if (esc) {
          esc = false;
          continue;
        }
        if (ch === '\\') {
          esc = true;
          continue;
        }
        if (ch === '"') {
          inStr = !inStr;
          continue;
        }
        if (inStr) continue;
        if (ch === '{') depth++;
        if (ch === '}') {
          depth--;
          if (depth === 0) {
            end = i + 1;
            break;
          }
        }
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

  // Langfuse: emit trace for this turn
  if (langfuseConfigured()) {
    traceCreate({
      id: turnId,
      name: 'agent-turn',
      sessionId,
      metadata: { model: effectiveModel, hasTools: !!registry },
      startedAt,
    });
  }

  try {
    let round = 0;
    let currentMessages = messages;
    _log.debug(`turn start`, { turnId, hasTools: !!registry, stream });

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
        const abortMsg = preReasonResult.abortMessage || 'Request was blocked by a safety check';
        _log.warn(`Pipeline abort at pre-reason stage`, { turnId, reason: abortMsg });
        return {
          response: abortMsg,
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
      _log.debug(`Starting LLM stream`, {
        round,
        hasTools,
        useDirectStream,
        model: effectiveModel,
        provider: effectiveProvider.name,
      });

      const providerOpts = {
        reasoningEffort: options.reasoningEffort,
        topP: options.topP,
        repetitionPenalty: options.repetitionPenalty,
        searchRecencyFilter: options.searchRecencyFilter,
        returnCitations: options.returnCitations,
        returnImages: options.returnImages,
        httpReferer: options.httpReferer,
        xTitle: options.xTitle,
        numCtx: options.numCtx,
        numThread: options.numThread,
        keepAlive: options.keepAlive,
        dropParams: options.dropParams,
        includeVeniceSystemPrompt: options.includeVeniceSystemPrompt,
      };

      const pendingToolCalls = new Map<number, { name: string; jsonFragments: string[] }>();
      let hasStructuredToolCalls = false;

      if (useDirectStream) {
        _log.debug(`Using direct stream`, { round });
        for await (
          const chunk of effectiveProvider.stream({
            messages: currentMessages,
            model: effectiveModel,
            systemPrompt: nodeAwareSystemPrompt,
            ...providerOpts,
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
        // A 180-second AbortSignal prevents indefinite stalls on slow providers.
        // Note: We buffer the full response to properly parse tool calls, but also
        // emit chunks incrementally to the client for real-time display.
        _log.debug(`Using buffered stream with timeout`, { round, timeoutMs: 180_000 });
        const abortCtrl = new AbortController();
        const abortTimer = setTimeout(() => abortCtrl.abort(), 180_000);
        try {
          for await (
            const chunk of effectiveProvider.stream({
              messages: currentMessages,
              model: effectiveModel,
              systemPrompt: nodeAwareSystemPrompt,
              ...providerOpts,
              signal: abortCtrl.signal,
            })
          ) {
            if (!chunk.done) {
              if (chunk.event === 'tool_use_start' && chunk.blockIndex !== undefined && chunk.blockName) {
                hasStructuredToolCalls = true;
                pendingToolCalls.set(chunk.blockIndex, { name: chunk.blockName, jsonFragments: [] });
              } else if (chunk.event === 'input_json_delta' && chunk.blockIndex !== undefined) {
                const entry = pendingToolCalls.get(chunk.blockIndex);
                if (entry) entry.jsonFragments.push(chunk.delta);
              } else {
                roundResponse += chunk.delta;
                if (onChunk && chunk.delta.trim()) {
                  onChunk(chunk.delta);
                }
              }
            } else {
              tokensIn += chunk.tokensIn ?? 0;
              tokensOut += chunk.tokensOut ?? 0;
              costUsd += chunk.costUsd ?? 0;
              _log.debug(`Stream completed`, {
                round,
                tokensIn,
                tokensOut,
                costUsd,
                responseLength: roundResponse.length,
                structuredToolCalls: hasStructuredToolCalls ? pendingToolCalls.size : undefined,
              });
            }
          }
        } catch (streamErr) {
          clearTimeout(abortTimer);
          const err = streamErr as Error;
          if (err.name === 'AbortError' || err.message.includes('abort')) {
            _log.warn(`Streaming timeout after 180s`, {
              round,
              turnId,
              responseLength: roundResponse.length,
            });
            return {
              response:
                'Request timed out. The task may be too complex or the provider is slow. Please try again or break down the request into smaller parts.',
              tokensIn,
              tokensOut,
              costUsd,
              turnId,
              durationMs: Date.now() - started,
            };
          }
          _log.error(`Streaming error`, { round, turnId, error: err.message, stack: err.stack });
          throw streamErr;
        } finally {
          clearTimeout(abortTimer);
        }
      }

      response = roundResponse;
      _log.trace(`response buffered`, { round, responseLen: roundResponse.length });

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
        const abortMsg = postReasonResult.abortMessage ||
          'Request was blocked during response processing';
        _log.warn(`Pipeline abort at post-reason stage`, { turnId, reason: abortMsg });
        return {
          response: abortMsg,
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

      let toolCalls: ToolCallRequest[];
      if (hasStructuredToolCalls && pendingToolCalls.size > 0) {
        toolCalls = [...pendingToolCalls.entries()].map(([_idx, entry]) => {
          const raw = entry.jsonFragments.join('');
          try {
            const args = raw ? JSON.parse(raw) as Record<string, unknown> : {};
            return { toolName: entry.name, args };
          } catch {
            return { toolName: entry.name, args: {} };
          }
        });
        _log.debug(`tool calls from structured blocks`, {
          round,
          count: toolCalls.length,
          names: toolCalls.map((t) => t.toolName).join(','),
        });
      } else {
        toolCalls = parseToolCalls(roundResponse);
      }
      _log.debug(`tool calls parsed`, {
        round,
        count: toolCalls.length,
        names: toolCalls.map((t) => t.toolName).join(','),
      });
      if (langfuseConfigured()) {
        generationCreate({
          traceId: turnId,
          id: `${turnId}-round-${round}`,
          name: `llm-round-${round}`,
          parentObservationId: turnId,
          startTime: startedAt,
          endTime: new Date().toISOString(),
          model: effectiveModel,
          input: currentMessages.slice(-2).map((m) => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content.slice(0, 500) : m.content,
          })),
          output: roundResponse.slice(0, 2000),
          usage: { input: tokensIn, output: tokensOut, unit: 'TOKENS' },
        });
      }

      // Detect if agent is stuck promising to use tools but not actually calling them
      const hasToolPromises =
        /\b(search|look up|find|check|web search|perform a search|let me search|I will search|I'll search|let me look|I'll find|I'll check)\b/i
          .test(roundResponse);
      const isStuckInPromiseLoop = hasToolPromises && toolCalls.length === 0 && round >= 1;

      _log.debug(`Promise loop analysis`, {
        round,
        hasToolPromises,
        toolCallsCount: toolCalls.length,
        responseLength: roundResponse.length,
        isStuckInPromiseLoop,
        responsePreview: roundResponse.slice(0, 200).replace(/\n/g, '\\n'),
      });

      if (isStuckInPromiseLoop) {
        _log.warn(`Agent stuck in promise loop, attempting tool execution`, {
          round,
          responseLength: roundResponse.length,
          fullResponse: roundResponse.slice(0, 1000),
        });

        const searchQueryMatch = roundResponse.match(
          /(?:search|look up|find|check for)\s+(.+?)(?:\.|$|\n)/i,
        );
        if (searchQueryMatch && registry && toolCtx) {
          const searchQuery = searchQueryMatch[1].trim();
          _log.info(`Auto-executing web search for: "${searchQuery}"`, { turnId, round });

          try {
            const webSearchResult = await executeTool(
              {
                toolName: 'web_search',
                args: { query: searchQuery, max_results: 5 },
              },
              registry,
              toolCtx,
            );

            if (webSearchResult.success) {
              _log.info(`Auto web search successful`, {
                turnId,
                round,
                outputLength: webSearchResult.output.length,
              });
              const autoToolResults = [webSearchResult];
              const resultText = formatToolResults(autoToolResults);
              currentMessages = [
                ...currentMessages,
                { role: 'assistant' as const, content: roundResponse },
                {
                  role: 'user' as const,
                  content:
                    `${resultText}\n\nBased on the search results above, please provide your complete response to the user.`,
                },
              ];
              round++;
              continue;
            }

            _log.warn(`Auto web search failed`, { turnId, round, error: webSearchResult.error });
          } catch (err) {
            _log.error(`Auto web search error`, { turnId, round, error: (err as Error).message });
          }
        }

      const shouldListWorkspace =
        /\bfile_list\b/i.test(roundResponse) ||
        /(?:check|inspect|list|scan) (?:what already exists in |the )?workspace/i.test(roundResponse) ||
        /what already exists in the workspace/i.test(roundResponse);
        if (shouldListWorkspace && registry && toolCtx) {
          _log.info(`Auto-executing workspace list`, { turnId, round });
          try {
            const workspaceListResult = await executeTool(
              {
                toolName: 'file_list',
                args: { workspace: 'agent' },
              },
              registry,
              toolCtx,
            );

            if (workspaceListResult.success) {
              const resultText = formatToolResults([workspaceListResult]);
              currentMessages = [
                ...currentMessages,
                { role: 'assistant' as const, content: roundResponse },
                {
                  role: 'user' as const,
                  content:
                    `${resultText}\n\nBased on the workspace listing above, continue with the task and make the recommendations.`,
                },
              ];
              round++;
              continue;
            }

            _log.warn(`Auto workspace list failed`, {
              turnId,
              round,
              error: workspaceListResult.error,
            });
          } catch (err) {
            _log.error(`Auto workspace list error`, { turnId, round, error: (err as Error).message });
          }
        }
      }

      const continuationRe = /\b(?:i['’]ll|i will|i am going to|let me|first,|next,|then,|i need to|i need to first|i'll start|i’m going to|i will first)\b/i;
      const completionRe = /\b(?:done|finished|complete|completed|implemented|created|built|updated|fixed)\b/i;
      const needsContinuation = toolCalls.length === 0 && continuationRe.test(roundResponse) && !completionRe.test(roundResponse);
      if (needsContinuation) {
        _log.debug(`Plan without tool call, prompting continuation`, {
          round,
          responsePreview: roundResponse.slice(0, 200).replace(/\n/g, '\\n'),
        });
        currentMessages = [
          ...currentMessages,
          { role: 'assistant' as const, content: roundResponse },
          {
            role: 'user' as const,
            content:
              'Continue with the next concrete step now. Do not restate the plan; execute it or produce the next result.',
          },
        ];
        round++;
        continue;
      }

      if (toolCalls.length === 0 && hasToolPromises) {
        _log.debug(`Promise without tool call, prompting another round`, {
          round,
          responsePreview: roundResponse.slice(0, 200).replace(/\n/g, '\\n'),
        });

        currentMessages = [
          ...currentMessages,
          { role: 'assistant' as const, content: roundResponse },
          {
            role: 'user' as const,
            content:
              'You indicated you would take action, but no tool call was emitted. Please do it now and then continue with the result.',
          },
        ];
        round++;
        continue;
      }

      if (toolCalls.length === 0) {
        // No tool calls — this is the final clean response.
        // In direct streaming mode, emit now. In buffered mode with incremental
        // streaming, chunks were already emitted above during streaming.
        _log.trace(`final clean response`, { round, hasOnChunk: !!onChunk, useDirectStream });
        if (useDirectStream && onChunk) {
          // Direct streaming: emit the final accumulated response
          onChunk(stripToolCallMarkup(roundResponse));
        }
        // Buffered streaming: chunks already emitted during streaming phase above
        break;
      }

      // Has tool calls — chunks already emitted during streaming phase at line 721.
      // The WebSocket handler will strip tool calls from those chunks before
      // sending to client, so the user sees prose without JSON/XML.
      // Skip redundant emission here to avoid duplication.

      _log.debug(`Starting tool execution loop`, { round, toolCallsCount: toolCalls.length });
      const toolResults = [];
      for (const [index, tc] of toolCalls.entries()) {
        _log.debug(`Executing tool ${index + 1}/${toolCalls.length}`, {
          round,
          toolName: tc.toolName,
          argsCount: Object.keys(tc.args).length,
        });

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
          _log.warn(`Tool execution blocked by pre-tool hook`, {
            round,
            toolName: tc.toolName,
            reason: preToolResult.abortMessage,
          });
          toolResults.push({
            toolName: tc.toolName,
            success: false,
            output: '',
            error: preToolResult.abortMessage || 'Tool execution blocked by hook',
            durationMs: 0,
          });
          continue;
        }

        _log.debug(`Executing tool`, {
          tool: tc.toolName,
          args: JSON.stringify(tc.args).slice(0, 120),
        });
        const toolSpanId = `${turnId}-tool-${round}-${tc.toolName}`;
        if (langfuseConfigured()) {
          spanCreate({
            traceId: turnId,
            id: toolSpanId,
            name: `tool:${tc.toolName}`,
            parentObservationId: `${turnId}-round-${round}`,
            startTime: new Date().toISOString(),
            input: tc.args,
          });
        }
        const result = await executeTool(tc, registry, toolCtx);
        if (langfuseConfigured()) {
          spanUpdate(toolSpanId, turnId, {
            endTime: new Date().toISOString(),
            output: result.output.slice(0, 2000),
            level: result.success ? 'DEFAULT' : 'ERROR',
            statusMessage: result.error,
          });
        }
        _log.debug(`Tool execution completed`, {
          tool: tc.toolName,
          success: result.success,
          outputLen: result.output.length,
          error: result.error ?? '',
          durationMs: result.durationMs,
        });
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

        import('../quartermaster/mod.ts').then(({ observe }) => {
          observe({
            turnId,
            sessionId,
            toolCall: tc,
            toolResult: result,
            toolIndex: index,
            totalToolsInTurn: toolCalls.length,
          }).catch(() => {});
        });
      }
      _log.debug(`Tool execution loop completed`, { round, resultsCount: toolResults.length });

      const resultText = formatToolResults(toolResults);

      let qmHint = '';
      try {
        const { predict } = await import('../quartermaster/mod.ts');
        const prediction = await predict({
          turnId,
          sessionId,
          userMessage: effectiveInput,
          assessment: metaAssessment,
          recentToolCalls: toolCalls.map((t) => t.toolName),
          toolCallIndex: toolCalls.length,
          totalToolsInTurn: toolCalls.length,
        });
        if (prediction) {
          qmHint = prediction.mode === 'suggest'
            ? `\nHint: The Quartermaster suggests using "${prediction.suggestedTool}" next (confidence: ${(prediction.confidence * 100).toFixed(0)}%).`
            : '';
          _log.debug(`Quartermaster prediction`, {
            round,
            suggestedTool: prediction.suggestedTool,
            confidence: prediction.confidence,
            mode: prediction.mode,
          });
        }
      } catch (e) {
        _log.debug(`Quartermaster predict skipped`, { round, error: (e as Error).message });
      }

      const roundsLeft = maxToolRounds - round - 1;
      const followUpInstruction = roundsLeft <= 2
        ? `${resultText}\n\nYou have ${roundsLeft} tool round(s) remaining. Your next response must be your final answer. If the user asked you to create a file, use file_write NOW. Do not make more research calls — produce the deliverable.${qmHint}`
        : `${resultText}\n\nBased on the tool output above, continue the task. If you have gathered enough context to act, do so now — prefer producing artifacts (files, code, plans) over further research. Only read more files if absolutely necessary.${qmHint}`;

      currentMessages = [
        ...currentMessages,
        { role: 'assistant' as const, content: roundResponse },
        { role: 'user' as const, content: followUpInstruction },
      ];

      _log.debug(`Advancing to next round`, {
        round,
        next: round + 1,
        roundsLeft: maxToolRounds - round - 1,
      });
      round++;
    }
    if (round >= maxToolRounds && response === '') {
      hitToolCeiling = true;
      _log.warn(`Hit tool ceiling with no response`, { round, maxToolRounds });
    }
    _log.info(`Agent loop completed`, {
      turnId,
      finalRound: round,
      responseLength: response.length,
      hitToolCeiling,
      totalTokensUsed: tokensIn + tokensOut,
      totalCost: costUsd,
      toolCallsMade: state.toolCallsMade,
    });
  } catch (err) {
    errorMsg = (err as Error).message;
    throw err;
  } finally {
    clearTimeout(overallTimer);

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
        provider: mqmPredictedProviderKind ?? effectiveProvider.name,
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
    let finalOutput = stripToolCallMarkup(response || '(error)');
    if (preOutputResult.aborted) {
      const abortMsg = preOutputResult.abortMessage || 'Request was blocked before final output';
      _log.warn(`Pipeline abort at pre-output stage`, { turnId, reason: abortMsg });
      finalOutput = abortMsg;
    } else {
      finalOutput = preOutputCtx.output ?? finalOutput;
    }

    const durationMs = Date.now() - started;
    const episodicSummary = `User: ${userMessage.slice(0, 200)}\nAssistant: ${
      (response || '(error)').slice(0, 200)
    }`;
    // Critical operations that must complete before returning
    await Promise.all([
      (options.persistAssistantMessage === false)
        ? Promise.resolve()
        : persistMessage(sessionDb, 'assistant', finalOutput, tokensOut),
      incrementTurn(sessionId),
    ]);

    // Fire-and-forget background operations - never block the response
    (async () => {
      try {
        await Promise.allSettled([
          writeEpisodic({
            sessionId,
            summary: episodicSummary,
            importance: Math.min(1.0, 0.3 + (userMessage.length / 500)),
            embedder: options.embedder,
          }),
          extractAndStoreEntities(`${userMessage} ${response}`, sessionId),
          detectAndPersistPreference(userMessage),
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

        // Handle reflection separately since it has additional dependencies
        if (options.enableReflection && response) {
          try {
            const r = await reflectOnTurn(
              userMessage,
              response,
              effectiveProvider,
              effectiveModel,
              options.reasoningEffort,
            );
            await storeReflection(sessionId, r);
            if (collectedToolCalls.length > 0) {
              const { learn } = await import('../quartermaster/mod.ts');
              learn({
                sessionId,
                turnId,
                reflection: r,
                actualToolCalls: collectedToolCalls.map((t) => t.tool),
              }).catch(() => {});
            }

            const adv = await adversarialReflection(
              userMessage,
              response,
              effectiveProvider,
              effectiveModel,
              options.reasoningEffort,
            );
            await storeReflection(sessionId, adv, 'adversarial');
          } catch (reflectionErr) {
            _log.warn('Reflection failed', {
              error: (reflectionErr as Error).message,
              sessionId,
              turnId,
            });
          }
        }
      } catch (bgErr) {
        _log.warn('Background operations failed', {
          error: (bgErr as Error).message,
          sessionId,
          turnId,
        });
      }
    })().catch(() => {});

    if (collectedToolCalls.length >= 2) {
      extractSkillFromSession(
        sessionId,
        userMessage.slice(0, 300),
        collectedToolCalls,
        provider,
        model,
      ).then(async (skillId) => {
        if (skillId && options.embedder) {
          const { deduplicateExtractedSkill } = await import('../memory/skills.ts');
          deduplicateExtractedSkill(skillId, options.embedder).catch(() => {});
        }
      }).catch(() => {});
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
  return {
    response,
    tokensIn,
    tokensOut,
    costUsd,
    turnId,
    durationMs,
    hitToolCeiling,
    toolCallsMade: state.toolCallsMade,
  };
}
