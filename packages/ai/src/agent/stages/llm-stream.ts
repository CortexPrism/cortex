import { logger } from '../../../../../src/utils/logger.ts';
import { createPipelineContext, runHooksForStage } from '../../pipeline/manager.ts';
import { executeTool, formatToolResults } from '../../tools/executor.ts';
import { parseToolCalls } from '../../tools/executor.ts';
import { stripToolCallMarkup } from '../helpers/strip-tool-calls.ts';
import { runToolCalls } from './tool-executor.ts';
import {
  isConfigured as langfuseConfigured,
  traceCreate,
} from '../../../../../src/observability/langfuse.ts';
import { OBS_CONTEXT } from '../../../../../src/observability/provider-wrapper.ts';
import type { CompletionOptions, Message } from '../../llm/types.ts';
import type { ToolCallRequest, ToolCallResult } from '../../tools/types.ts';
import type { TurnContext } from '../pipeline/context.ts';

const _log = logger('agent:loop');

export async function runLLMStream(ctx: TurnContext): Promise<void> {
  const { options, turnId, effectiveInput, messages: initialMessages, state } = ctx;
  const { sessionId, onChunk, stream = true } = options;
  const registry = ctx.registry;
  const toolCtx = ctx.toolCtx;
  const metaAssessment = ctx.metaAssessment;
  const effectiveProvider = ctx.effectiveProvider;
  const effectiveModel = ctx.effectiveModel;
  const nodeAwareSystemPrompt = ctx.nodeAwareSystemPrompt;
  const maxToolRounds = ctx.maxToolRounds;

  const collectedToolCalls = ctx.collectedToolCalls;

  const SENSITIVE_KEYS = /^(api_?key|token|secret|password|auth|credential|private_?key)$/i;
  function redactParams(params: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params)) {
      out[k] = SENSITIVE_KEYS.test(k) ? '[REDACTED]' : v;
    }
    return out;
  }

  if (langfuseConfigured()) {
    traceCreate({
      id: turnId,
      name: 'agent-turn',
      sessionId,
      metadata: { model: effectiveModel, hasTools: !!registry },
      startedAt: new Date(ctx.started).toISOString(),
    });
  }

  let round = 0;
  let tokensIn = ctx.tokensIn;
  let tokensOut = ctx.tokensOut;
  let costUsd = ctx.costUsd;

  let currentMessages = initialMessages;

  const externalSignal = options.signal;

  const checkAborted = (): void => {
    if (externalSignal?.aborted) {
      const err = new Error('Turn cancelled by user');
      err.name = 'AbortError';
      throw err;
    }
  };

  _log.debug(`turn start`, { turnId, hasTools: !!registry, stream });

  let subAgentsCompleted = false;

  const searchToolNames = new Set([
    'search',
    'web_search',
    'web_search_enhanced',
    'brave_search',
    'tavily_search',
    'web_fetch',
    'serpapi_search',
  ]);
  let consecutiveSearchRounds = 0;
  const recentAssistantOutputs: string[] = [];

  while (round < maxToolRounds) {
    checkAborted();
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
      ctx.response = abortMsg;
      ctx.tokensIn = tokensIn;
      ctx.tokensOut = tokensOut;
      ctx.costUsd = costUsd;
      return;
    }

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

    const streamObsCtx = {
      sessionId,
      turnId,
      actor: 'agent',
      parentTraceId: turnId,
    };

    const pendingToolCalls = new Map<number, { name: string; jsonFragments: string[] }>();
    let hasStructuredToolCalls = false;

    if (useDirectStream) {
      _log.debug(`Using direct stream`, { round });
      const streamOpts: Record<string | symbol, unknown> = {
        messages: currentMessages,
        model: effectiveModel,
        systemPrompt: nodeAwareSystemPrompt,
        ...providerOpts,
      };
      streamOpts[OBS_CONTEXT] = streamObsCtx;
      for await (
        const chunk of effectiveProvider.stream(streamOpts as unknown as CompletionOptions)
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
      _log.debug(`Using buffered stream with timeout`, { round, timeoutMs: ctx.streamTimeoutMs });
      const abortCtrl = new AbortController();
      const abortTimer = setTimeout(() => abortCtrl.abort(), ctx.streamTimeoutMs);

      if (externalSignal) {
        if (externalSignal.aborted) abortCtrl.abort();
        else externalSignal.addEventListener('abort', () => abortCtrl.abort(), { once: true });
      }

      try {
        const bufferedOpts: Record<string | symbol, unknown> = {
          messages: currentMessages,
          model: effectiveModel,
          systemPrompt: nodeAwareSystemPrompt,
          ...providerOpts,
          signal: abortCtrl.signal,
        };
        bufferedOpts[OBS_CONTEXT] = streamObsCtx;
        for await (
          const chunk of effectiveProvider.stream(bufferedOpts as unknown as CompletionOptions)
        ) {
          if (!chunk.done) {
            if (
              chunk.event === 'tool_use_start' && chunk.blockIndex !== undefined &&
              chunk.blockName
            ) {
              hasStructuredToolCalls = true;
              pendingToolCalls.set(chunk.blockIndex, {
                name: chunk.blockName,
                jsonFragments: [],
              });
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
          _log.warn(`Streaming timeout`, {
            round,
            turnId,
            responseLength: roundResponse.length,
          });
          ctx.response =
            'Request timed out. The task may be too complex or the provider is slow. Please try again or break down the request into smaller parts.';
          ctx.tokensIn = tokensIn;
          ctx.tokensOut = tokensOut;
          ctx.costUsd = costUsd;
          return;
        }
        _log.error(`Streaming error`, { round, turnId, error: err.message, stack: err.stack });
        throw streamErr;
      } finally {
        clearTimeout(abortTimer);
      }
    }

    ctx.response = roundResponse;
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
      ctx.response = abortMsg;
      ctx.tokensIn = tokensIn;
      ctx.tokensOut = tokensOut;
      ctx.costUsd = costUsd;
      return;
    }
    roundResponse = postReasonCtx.currentLLMResponse ?? roundResponse;
    ctx.response = roundResponse;
    if (postReasonCtx.messages && postReasonCtx.messages !== currentMessages) {
      currentMessages = postReasonCtx.messages;
    }

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

      const shouldListWorkspace = /\bfile_list\b/i.test(roundResponse) ||
        /(?:check|inspect|list|scan) (?:what already exists in |the )?workspace/i.test(
          roundResponse,
        ) ||
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
          _log.error(`Auto workspace list error`, {
            turnId,
            round,
            error: (err as Error).message,
          });
        }
      }
    }

    const continuationRe =
      /\b(?:i['']ll|i will|i am going to|let me|first,|next,|then,|i need to|i need to first|i'll start|i.m going to|i will first)\b/i;
    const completionRe =
      /\b(?:done|finished|complete|completed|implemented|created|built|updated|fixed)\b/i;
    const needsContinuation = toolCalls.length === 0 && continuationRe.test(roundResponse) &&
      !completionRe.test(roundResponse);
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

    const toolCallBlockRe = /<tool_call>[\s\S]*?<\/tool_call>/;
    const hasToolCallBlock = toolCallBlockRe.test(roundResponse);
    const hasMalformedToolCall = toolCalls.length === 0 &&
      (/<tool_call\s+name=/.test(roundResponse) ||
        /<tool_call>[\s\S]*?<tool_call\s+name=/.test(roundResponse) ||
        /<tool_call>[\s\S]*?<tool_call>/.test(roundResponse) ||
        hasToolCallBlock ||
        (/\{\s*"(?:task|prompt|type|description|query|path)"\s*:/.test(roundResponse) &&
          !/\{\s*"(?:tool|name)"\s*:/.test(roundResponse) &&
          /<tool_call>/.test(roundResponse)));

    if (hasMalformedToolCall) {
      _log.warn(`Malformed tool call detected, asking LLM to retry with correct format`, {
        round,
        responsePreview: roundResponse.slice(0, 200).replace(/\n/g, '\\n'),
      });
      const blockHint = hasToolCallBlock
        ? ' The JSON inside your <tool_call> block could not be parsed — this is usually because the string values contain unescaped double quotes (") or other special characters. Make sure ALL double quotes INSIDE string values are escaped as \\".'
        : '';
      currentMessages = [
        ...currentMessages,
        { role: 'assistant' as const, content: roundResponse },
        {
          role: 'user' as const,
          content:
            `ERROR: Your tool call was NOT executed. The JSON format was not recognized. You MUST emit the tool call using the EXACT format below. Do NOT describe what happened or summarize — actually call the tool:\n\n<tool_call>\n{"tool": "TOOL_NAME", "args": {"param1": "value1", "param2": "value2"}}\n</tool_call>\n\nThe "tool" key must contain the tool name. All parameters go inside the "args" object.${blockHint}\n\nIMPORTANT: No action was taken. Re-emit your tool call NOW.`,
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
      _log.trace(`final clean response`, { round, hasOnChunk: !!onChunk, useDirectStream });
      if (useDirectStream && onChunk) {
        onChunk(stripToolCallMarkup(roundResponse));
      }
      break;
    }

    _log.debug(`Starting tool execution loop`, { round, toolCallsCount: toolCalls.length });

    const toolResults = await runToolCalls(ctx, round, toolCalls);

    const resultText = formatToolResults(toolResults);

    const allSearchTools = toolCalls.length > 0 &&
      toolCalls.every((tc) => searchToolNames.has(tc.toolName));
    if (allSearchTools) {
      consecutiveSearchRounds++;
    } else {
      consecutiveSearchRounds = 0;
    }
    recentAssistantOutputs.push(roundResponse);
    if (recentAssistantOutputs.length > 4) recentAssistantOutputs.shift();

    let recursionWarning = '';
    if (allSearchTools) {
      for (const tc of toolCalls) {
        const query = String(tc.args.query ?? tc.args.q ?? tc.args.prompt ?? '');
        if (query.length < 20) continue;
        for (const pastOutput of recentAssistantOutputs) {
          const normalizedQuery = query.replace(/\s+/g, ' ').toLowerCase().slice(0, 80);
          const normalizedPast = pastOutput.replace(/\s+/g, ' ').toLowerCase();
          if (normalizedPast.includes(normalizedQuery) && normalizedQuery.length > 30) {
            _log.warn(`Self-referential tool call detected`, {
              round,
              toolName: tc.toolName,
              queryPreview: query.slice(0, 80),
            });
            recursionWarning =
              `\n\n[SYSTEM WARNING: Your last search query appears to recycle text from your own prior responses. This indicates you are chasing noise, not the user's request. REREAD the original user message and focus ONLY on what the user asked for. Do not search for or analyze your own output — produce results for the user.]`;
            consecutiveSearchRounds = 999;
            break;
          }
        }
        if (recursionWarning) break;
      }
    }

    if (!recursionWarning && consecutiveSearchRounds >= 3) {
      _log.warn(
        `Confusion spiral detected: ${consecutiveSearchRounds} consecutive search-only rounds`,
        {
          turnId,
          round,
          toolNames: toolCalls.map((t) => t.toolName).join(','),
        },
      );
      recursionWarning =
        `\n\n[SYSTEM WARNING: You have spent ${consecutiveSearchRounds} rounds doing searches without producing user-facing output. This may indicate you are chasing tangents or processing noise from search results. REREAD the original user message. Ignore any sidebar suggestions, auto-complete text, or "related topics" from search engines. Produce your answer NOW based on the first batch of search results you collected.]`;
      consecutiveSearchRounds = 0;
    }

    let qmHint = '';
    try {
      const { predict } = await import('../../../../../src/quartermaster/mod.ts');
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
          ? `\nHint: The Quartermaster suggests using "${prediction.suggestedTool}" next (confidence: ${
            (prediction.confidence * 100).toFixed(0)
          }%).`
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

    if (!subAgentsCompleted) {
      subAgentsCompleted = toolCalls.some((t) => t.toolName === 'sub_agent') &&
        toolResults.some((r) => r?.toolName === 'sub_agent' && r.success);
    }

    let subAgentHint = '';
    if (subAgentsCompleted) {
      subAgentHint =
        `\nSub-agents completed. Their full output is in the <tool_result> blocks above — READ IT and synthesize a comprehensive answer for the user. Do NOT narrate what the sub-agents did ("the first sub-agent completed..." etc). Do NOT promise to check on them. They are done. Deliver the final result NOW.`;
    }

    const followUpInstruction = roundsLeft <= 2
      ? `${resultText}\n\nYou have ${roundsLeft} tool round(s) remaining. Your next response must be your final answer. If the user asked you to create a file, use file_write NOW. Do not make more research calls — produce the deliverable.${subAgentHint}${qmHint}${recursionWarning}`
      : `${resultText}\n\nBased on the tool output above, continue the task. If you have gathered enough context to act, do so now — prefer producing artifacts (files, code, plans) over further research. Only read more files if absolutely necessary.${subAgentHint}${qmHint}${recursionWarning}`;

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
  if (round >= maxToolRounds && ctx.response === '') {
    ctx.hitToolCeiling = true;
    _log.warn(`Hit tool ceiling with no response`, { round, maxToolRounds });
  }
  _log.info(`Agent loop completed`, {
    turnId,
    finalRound: round,
    responseLength: ctx.response.length,
    hitToolCeiling: ctx.hitToolCeiling,
    totalTokensUsed: tokensIn + tokensOut,
    totalCost: costUsd,
    toolCallsMade: state.toolCallsMade,
  });

  ctx.tokensIn = tokensIn;
  ctx.tokensOut = tokensOut;
  ctx.costUsd = costUsd;
}
