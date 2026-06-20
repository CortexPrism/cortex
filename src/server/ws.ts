import { logger } from '../utils/logger.ts';
import { agentTurn } from '../agent/loop.ts';
import { buildSystemPrompt, loadSoulContext } from '../agent/soul.ts';
import { closeSession, createSession, getSession, resumeSession } from '../db/sessions.ts';
import { logEvent } from '../db/lens.ts';
import { initSessionDb } from '../db/migrate.ts';
import {
  buildProvider,
  buildProviderFromConfig,
  buildRouter,
  PROVIDER_DEFAULT_CONTEXT_WINDOWS,
} from '../llm/router.ts';
import { loadConfig } from '../config/config.ts';
import type { AgentConfig } from '../config/config.ts';
import type { ContentBlock } from '../llm/types.ts';
import { buildEmbedder } from '../memory/embeddings.ts';
import { globalRegistry } from '../tools/registry.ts';
import type { Tool } from '../tools/types.ts';
import { onFileChange } from '../workspace/events.ts';
import { getDefaultAgent, loadAgentIdentity } from '../agent/manager.ts';

const _log = logger('server:ws');

type WsMsg =
  | {
    type: 'chat';
    message: string;
    sessionId?: string;
    agentId?: string;
    model?: string;
    modelMode?: 'manual' | 'auto';
    reasoningEffort?: string;
    files?: Array<{ filename: string; mimeType: string; data: string }>;
  }
  | { type: 'new_session' }
  | { type: 'select_agent'; agentId: string }
  | { type: 'ping' }
  | { type: 'audio_chunk'; data: string; format?: string; session: boolean }
  | { type: 'audio_end'; session: boolean }
  | { type: 'speak'; text: string; voice?: string }
  | { type: 'audio'; data: string; format?: string }
  | { type: 'voice_state'; speaking: boolean }
  | { type: 'approval_response'; requestId: string; approved: boolean };

function send(ws: WebSocket, data: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

/**
 * Pending approval requests (requestId -> resolver)
 * Maps request IDs to promise resolvers for async approval flow
 */
const pendingApprovals = new Map<string, (approved: boolean) => void>();

const wsClients = new Map<WebSocket, { sessionId: string | null }>();

function stripToolMarkup(text: string): string {
  return text
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
    .replace(/<tool_call_name>[\s\S]*?<\/tool_call_name>/g, '')
    .replace(/<tool_call_name="[a-zA-Z0-9_-]+"\s*\/?>/g, '')
    .replace(/<tool_call_args>[\s\S]*?<\/tool_call_args>/g, '')
    .replace(/<tool_call_arg_key>[\s\S]*?<\/tool_call_arg_key>/g, '')
    .replace(/<tool_call_arg_value>[\s\S]*?<\/tool_call_arg_value>/g, '')
    .replace(/<parameter\s[^>]*>[\s\S]*?<\/parameter>/g, '')
    .replace(/<tool_result[\s\S]*?<\/tool_result>/g, '')
    .replace(/```[\s\S]*?```/g, (block) => /\{\s*"(tool|name)"\s*:/.test(block) ? '' : block)
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

function broadcast(msg: unknown, targetSessionId?: string): void {
  const data = JSON.stringify(msg);
  for (const [ws, info] of wsClients) {
    if (ws.readyState === WebSocket.OPEN) {
      if (targetSessionId && info.sessionId && info.sessionId !== targetSessionId) continue;
      try {
        ws.send(data);
      } catch { /* client may have disconnected */ }
    }
  }
}

async function isWsAuthenticated(req: Request): Promise<boolean> {
  const config = await loadConfig();
  const webAuth = config.webAuth || {};
  if (webAuth.requireAuth === false) return true;
  const { hasPassword, parseCookies, validateSession } = await import('./auth.ts');
  const pwExists = await hasPassword();
  if (!pwExists) return true;
  const cookies = parseCookies(req.headers.get('cookie') || '');
  const sessionId = cookies['cortex_session'];
  return sessionId ? validateSession(sessionId) : false;
}

/**
 * Request Web UI approval for sensitive data access
 * Sends approval_request message and waits for approval_response
 *
 * @param ws — WebSocket connection to send request on
 * @param req — Access request details
 * @param reasoning — AI supervisor's reasoning
 * @returns Promise<boolean> — true if approved, false if denied or timeout
 */
export async function requestWebUIApproval(
  ws: WebSocket,
  req: Parameters<typeof import('../security/supervisor.ts')['requestSupervisorDecision']>[0],
  reasoning: string,
): Promise<boolean> {
  const requestId = crypto.randomUUID();

  return new Promise((resolve) => {
    pendingApprovals.set(requestId, resolve);

    // Send approval request to Web UI
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'approval_request',
          request: req,
          reasoning,
          requestId,
        }),
      );
    } else {
      // Can't send if WebSocket not open
      pendingApprovals.delete(requestId);
      resolve(false);
      return;
    }

    // Timeout after 5 minutes
    const timeoutId = setTimeout(() => {
      if (pendingApprovals.has(requestId)) {
        pendingApprovals.delete(requestId);
        resolve(false); // Deny on timeout
      }
    }, 5 * 60 * 1000); // 5 minutes

    // Clean up timeout on resolution
    const originalResolve = resolve;
    pendingApprovals.set(requestId, (approved: boolean) => {
      clearTimeout(timeoutId);
      pendingApprovals.delete(requestId);
      originalResolve(approved);
    });
  });
}

export async function handleWebSocket(req: Request): Promise<Response> {
  const authed = await isWsAuthenticated(req);
  if (!authed) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { socket: ws, response } = Deno.upgradeWebSocket(req);
  wsClients.set(ws, { sessionId: null });

  let sessionId: string | null = null;
  let sessionDbRef: Awaited<ReturnType<typeof initSessionDb>> | null = null;
  let turnInFlight = false;
  let closeAfterTurn = false;
  let assistantMessageId: number | null = null;
  let assistantDraft = '';
  let assistantFlushTimer: number | null = null;

  function clearAssistantFlushTimer(): void {
    if (assistantFlushTimer !== null) {
      clearTimeout(assistantFlushTimer);
      assistantFlushTimer = null;
    }
  }

  async function flushAssistantDraft(finalText?: string, tokenCount?: number): Promise<void> {
    if (!sessionDbRef || assistantMessageId === null) return;
    const content = finalText ?? assistantDraft;
    await sessionDbRef.run(
      `UPDATE session_messages SET content = ?, token_count = COALESCE(?, token_count) WHERE id = ?`,
      [content, tokenCount ?? null, assistantMessageId],
    ).catch(() => {});
  }

  function scheduleAssistantFlush(): void {
    if (assistantFlushTimer !== null || assistantMessageId === null) return;
    assistantFlushTimer = setTimeout(() => {
      assistantFlushTimer = null;
      flushAssistantDraft().catch(() => {});
    }, 250) as unknown as number;
  }

  const unsubscribe = onFileChange((event) => {
    broadcast({ type: 'file_change', ...event }, sessionId ?? undefined);
  });

  ws.onopen = () => send(ws, { type: 'connected' });

  ws.onclose = async () => {
    wsClients.delete(ws);
    unsubscribe();
    clearAssistantFlushTimer();
    if (!sessionId || !sessionDbRef) return;
    if (turnInFlight) {
      closeAfterTurn = true;
      return;
    }
    sessionDbRef.close();
  };

  // Currently selected agent ID for this session
  let activeAgent: AgentConfig | null = null;

  async function resolveAgent(agentId?: string): Promise<AgentConfig> {
    if (agentId) {
      const { getAgent } = await import('../agent/manager.ts');
      const agent = await getAgent(agentId);
      if (agent) return agent;
    }
    if (activeAgent) return activeAgent;
    return await getDefaultAgent();
  }

  function providerSupportsMultimodal(providerKind: string): boolean {
    return providerKind === 'anthropic' || providerKind === 'google';
  }

  function buildContentBlocks(
    message: string,
    files: Array<{ filename: string; mimeType: string; data: string }>,
    includeImages: boolean,
    includeDocuments: boolean,
  ): ContentBlock[] {
    const blocks: ContentBlock[] = [];
    if (message.trim()) {
      blocks.push({ type: 'text', text: message });
    }
    for (const file of files) {
      const isImage = file.mimeType.startsWith('image/');
      if (isImage && includeImages) {
        blocks.push({
          type: 'image',
          source: { type: 'base64', mediaType: file.mimeType, data: file.data },
        });
      } else if (!isImage && includeDocuments) {
        blocks.push({
          type: 'document',
          source: { type: 'base64', mediaType: file.mimeType, data: file.data },
        });
      }
    }
    return blocks;
  }

  async function processChatMessage(
    message: string,
    ws: WebSocket,
    agentId?: string,
    modelOverride?: string,
    reasoningEffortOverride?: string,
    files?: Array<{ filename: string; mimeType: string; data: string }>,
    resumeSessionId?: string,
    modelMode?: 'manual' | 'auto',
  ): Promise<void> {
    try {
      const config = await loadConfig();
      const agent = await resolveAgent(agentId);
      activeAgent = agent;

      let providerKind: import('../config/config.ts').ProviderKind;
      let model: string;
      let autoFallback = false;
      let autoFallbackReason: string | undefined;
      let requestedModelMode: 'manual' | 'auto' = modelMode ?? 'manual';

      if (modelMode === 'auto') {
        const { resolveAutoModel } = await import('../model-quartermaster/auto-resolver.ts');
        const resolution = await resolveAutoModel({
          userMessage: message,
          config,
          sessionId: sessionId ?? `pending_${Date.now()}`,
          turnId: `turn_${Date.now().toString(36)}`,
          agentProvider: agent.provider,
          agentModel: agent.model,
        });
        providerKind = resolution.provider;
        model = resolution.model;
        autoFallback = resolution.autoFallback;
        autoFallbackReason = resolution.autoFallbackReason;
      } else {
        providerKind = agent.provider || config.defaultProvider;
        model = modelOverride || agent.model || config.providers[providerKind]?.model || 'unknown';
      }

      const provider = buildProviderFromConfig(
        providerKind,
        config.providers[providerKind] ?? {
          kind: providerKind,
          model: model,
        },
      );
      const router = buildRouter(config);
      const effectiveProvider = router ?? provider;
      const provCfg = config.providers[providerKind];
      const reasoningEffort = reasoningEffortOverride ?? provCfg?.reasoningEffort;
      const providerSpecificOpts = {
        topP: provCfg?.topP,
        repetitionPenalty: provCfg?.repetitionPenalty,
        searchRecencyFilter: provCfg?.searchRecencyFilter,
        returnCitations: provCfg?.returnCitations,
        returnImages: provCfg?.returnImages,
        httpReferer: provCfg?.httpReferer,
        xTitle: provCfg?.xTitle,
        numCtx: provCfg?.numCtx,
        numThread: provCfg?.numThread,
        keepAlive: provCfg?.keepAlive,
        dropParams: provCfg?.dropParams,
        includeVeniceSystemPrompt: provCfg?.includeVeniceSystemPrompt,
      };
      const embedder = buildEmbedder(config);

      if (!sessionId) {
        if (resumeSessionId) {
          const existing = await getSession(resumeSessionId);
          if (existing && existing.status !== 'archived') {
            sessionId = resumeSessionId;
            wsClients.set(ws, { sessionId });
            sessionDbRef = await initSessionDb(sessionId);
            await resumeSession(sessionId);
            send(ws, { type: 'session', sessionId, agentId: agent.id, agentName: agent.name });
          }
        }

        if (!sessionId) {
          sessionId = `sess_${Date.now().toString(36)}_ws`;
          wsClients.set(ws, { sessionId });
          sessionDbRef = await initSessionDb(sessionId);
          await createSession(sessionId, 'web', undefined, activeAgent?.id);
          await logEvent({
            event_type: 'session_start',
            session_id: sessionId,
            actor: 'user',
            action: 'session_start',
            summary: `WebSocket session started with agent "${agent.name}"`,
            started_at: new Date().toISOString(),
          });
          send(ws, { type: 'session', sessionId, agentId: agent.id, agentName: agent.name });
        }
      }

      const identity = await loadAgentIdentity(agent);
      const systemPrompt = buildSystemPrompt(
        identity.soul,
        agent.systemPrompt,
        identity.user,
        identity.memory,
      );

      // Register all builtin tools (centralized registration)
      const registry = globalRegistry;
      const { registerAllBuiltins } = await import('../tools/registry.ts');
      const allTools = await registerAllBuiltins(registry, true);

      // Filter to allowed tools if agent specifies a subset
      if (agent.tools?.length) {
        // Clear registry and re-register only allowed tools
        for (const name of Object.keys(allTools)) {
          registry.unregister(name);
        }
        for (const name of agent.tools) {
          if (allTools[name]) {
            registry.register(allTools[name]);
          }
        }
      }

      const { pluginManager } = await import('../plugins/manager.ts');
      await pluginManager.loadAll().catch((e) => {
        _log.warn(`Plugin load warning`, { error: (e as Error).message });
      });

      send(ws, { type: 'start' });

      const multimodal = providerSupportsMultimodal(providerKind);
      const contentBlocks = files?.length
        ? buildContentBlocks(message, files, multimodal, multimodal)
        : undefined;

      const workspaceDir = (await import('../workspace/paths.ts')).getAgentWorkspaceDir(agent.id);
      const workingDir = Deno.cwd();
      await Promise.all([
        Deno.mkdir(workspaceDir, { recursive: true }),
      ]);

      // Create a tool progress forwarder that sends sub-agent events to the client
      const subAgentProgressHandler = (event: import('../tools/types.ts').ToolProgressEvent) => {
        try {
          send(ws, event);
        } catch {
          // client may have disconnected
        }
      };

      let fileNote = '';
      let extractionWarnings = 0;
      if (files?.length) {
        const { extractPdfText } = await import('../utils/pdf.ts');
        for (const file of files) {
          const sanitized = file.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
          const binary = Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0));
          const pathsToWrite = [
            `${workingDir}/${sanitized}`,
            `${workspaceDir}/${sanitized}`,
          ];
          for (const filePath of pathsToWrite) {
            try {
              await Deno.writeFile(filePath, binary);
            } catch (e) {
              _log.error(`Failed to save uploaded file`, {
                path: filePath,
                error: (e as Error).message,
              });
            }
          }
          const existsInWorkingDir = await Deno.stat(`${workingDir}/${sanitized}`).then(() => true)
            .catch(() => false);
          const existsInWorkspace = await Deno.stat(`${workspaceDir}/${sanitized}`).then(() => true)
            .catch(() => false);
          _log.debug(`File uploaded`, {
            filename: sanitized,
            size: binary.length,
            workingDir: existsInWorkingDir,
            workspaceDir: existsInWorkspace,
          });
          fileNote += `\n[File: ${sanitized} (${file.mimeType})`;

          const isImage = file.mimeType.startsWith('image/');
          if (isImage && !multimodal) {
            fileNote +=
              `\n(Note: current model/provider does not support image input. Consider switching to Anthropic or Google Gemini for image analysis. The file is saved at: ${sanitized})`;
          }

          if (file.mimeType === 'application/pdf') {
            try {
              const pdfText = await extractPdfText(binary);
              if (pdfText) {
                const preview = pdfText.slice(0, 2000);
                const truncated = pdfText.length > 2000
                  ? `\n[... ${
                    pdfText.length - 2000
                  } more characters — use file_read("${sanitized}") to read full document]`
                  : '';
                fileNote +=
                  `\n\n=== BEGIN DOCUMENT: ${sanitized} ===\n${preview}${truncated}\n=== END DOCUMENT: ${sanitized} ===`;
              } else {
                extractionWarnings++;
                fileNote +=
                  `\nPDF text extraction returned empty. Use the file_read tool to read: file_read("${sanitized}")`;
              }
            } catch (e) {
              extractionWarnings++;
              _log.warn(`PDF extraction failed`, {
                filename: sanitized,
                error: (e as Error).message,
              });
              fileNote +=
                `\nPDF text extraction failed. Use the file_read tool to read: file_read("${sanitized}")`;
            }
          }

          fileNote += ']';
        }
      }

      const hasImageFiles = files?.some((f) => f.mimeType.startsWith('image/')) ?? false;

      const effectiveMessage = message.trim() ? message + fileNote : fileNote
        ? (
          hasImageFiles
            ? 'Image file(s) uploaded. ' + fileNote
            : 'Document(s) uploaded. Read, analyze, and provide a thorough evaluation — include:\n- Summary of key content\n- Main points and findings\n- Your assessment and any recommendations\n\n' +
              fileNote
        )
        : message;

      let effectiveSystemPrompt = systemPrompt;
      effectiveSystemPrompt +=
        '\n\n## Environment\ncode_exec runs in an isolated Docker sandbox with NO access to host files or the workspace. Use file_read/file_write/file_list for all file operations. shell runs locally and CAN access files.';

      // Inject a loaded-plugin manifest so the LLM can connect user requests like
      // "test the chain-of-thought plugin" directly to the plugin's tools rather
      // than searching the filesystem for plugin source files.
      {
        const { getLoadedPluginSummaries } = await import('../plugins/loader.ts');
        const pluginSummaries = getLoadedPluginSummaries();
        if (pluginSummaries.length > 0) {
          const lines = pluginSummaries.map((p) => {
            const toolList = p.toolNames.map((n) => `\`${n}\``).join(', ');
            return `- **${p.name}**${
              p.description ? ` — ${p.description}` : ''
            }: tools ${toolList}`;
          });
          effectiveSystemPrompt +=
            `\n\n## Active Plugins\nThe following plugins are loaded and ready. When a user asks to use, test, or demonstrate a plugin by name, call its tools directly — do NOT search the filesystem for plugin source files.\n${
              lines.join('\n')
            }`;
        }
      }
      if (files?.length) {
        const fileNames = files.map((f) => f.filename.replace(/[^a-zA-Z0-9._-]/g, '_')).join(', ');
        effectiveSystemPrompt +=
          `\n\n## File Context\nThe user has uploaded files: ${fileNames}. The complete content has been included inline in the user message below (between === BEGIN/END DOCUMENT === markers if present). Analyze this content directly — do NOT call file_read to re-read the file unless the inline content is insufficient.`;
        if (extractionWarnings > 0) {
          effectiveSystemPrompt +=
            `\n\nNote: PDF text extraction failed for some files. Use \`file_read("<filename>")\` to read them.`;
        }
      }

      let capturedReasoning = '';

      const result = await agentTurn({
        userMessage: effectiveMessage,
        provider: effectiveProvider,
        model,
        sessionDb: sessionDbRef!,
        sessionId,
        systemPrompt: effectiveSystemPrompt,
        stream: true,
        reasoningEffort,
        persistUserMessage: false,
        persistAssistantMessage: false,
        ...providerSpecificOpts,
        onChunk: (() => {
          // Buffer to accumulate chunks for proper tool call detection
          let chunkBuffer = '';
          let lastSentIndex = 0;

          return (chunk: string) => {
            // Capture raw reasoning/tool calls before stripping
            capturedReasoning += chunk;

            // Add to buffer
            chunkBuffer += chunk;

            // Try to extract and send safe content that's definitely not part of a tool call
            // We look for complete tool calls and strip them, then send everything before
            // the next potential tool call start.

            let workingText = chunkBuffer;

            // Remove <tool_call>...</tool_call> blocks (complete ones only)
            workingText = workingText.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '');
            workingText = workingText.replace(/<tool_call_name>[\s\S]*?<\/tool_call_name>/g, '');
            workingText = workingText.replace(/<tool_call_name="[a-zA-Z0-9_-]+"\s*\/?>/g, '');
            workingText = workingText.replace(/<tool_call_args>[\s\S]*?<\/tool_call_args>/g, '');
            workingText = workingText.replace(
              /<tool_call_arg_key>[\s\S]*?<\/tool_call_arg_key>/g,
              '',
            );
            workingText = workingText.replace(
              /<tool_call_arg_value>[\s\S]*?<\/tool_call_arg_value>/g,
              '',
            );
            workingText = workingText.replace(/<parameter\s[^>]*>[\s\S]*?<\/parameter>/g, '');
            workingText = workingText.replace(/<tool_result[\s\S]*?<\/tool_result>/g, '');

            // Find and remove complete bare JSON tool calls
            const bareToolRe = /\{\s*"(tool|name)"\s*:/g;
            let bm: RegExpExecArray | null;
            const regions: Array<[number, number]> = [];
            while ((bm = bareToolRe.exec(workingText)) !== null) {
              const start = bm.index;
              let depth = 0;
              let inStr = false;
              let esc = false;
              let end = -1;
              for (let i = start; i < workingText.length; i++) {
                const ch = workingText[i];
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
              if (end > start) {
                regions.push([start, end]);
              }
            }

            // Remove matched regions right-to-left
            for (let i = regions.length - 1; i >= 0; i--) {
              workingText = workingText.slice(0, regions[i][0]) + workingText.slice(regions[i][1]);
            }

            // Remove fenced code blocks that contain tool call JSON
            workingText = workingText.replace(/```[\s\S]*?```/g, (block) => {
              return /\{\s*"(tool|name)"\s*:/.test(block) ? '' : block;
            });

            // Find the last position where we're confident there's no incomplete tool call
            // Look for the start of a potential tool call
            const potentialToolStart = workingText.search(/\{\s*["']/);

            let safeText = '';
            if (potentialToolStart === -1) {
              // No potential tool call start found, all text is safe
              safeText = workingText;
              chunkBuffer = '';
              lastSentIndex = 0;
            } else if (potentialToolStart > lastSentIndex) {
              // Send everything up to the potential tool call start
              safeText = workingText.slice(0, potentialToolStart);
              chunkBuffer = workingText.slice(potentialToolStart);
              lastSentIndex = 0;
            }

            // Preserve chunk boundary newlines so markdown paragraphs and lists
            // survive incremental streaming. Only collapse excessive blank lines.
            safeText = safeText.replace(/\n{3,}/g, '\n\n');
            if (safeText) {
              send(ws, { type: 'chunk', delta: safeText });
              if (assistantMessageId !== null) {
                assistantDraft += safeText;
              }
            }
          };
        })(),
        registry,
        toolContext: {
          workingDir,
          agentId: agent.id,
          workspaceDir,
          approvalGate: async (tool: string, command: string, sampleData?: string) => {
            return await requestWebUIApproval(
              ws,
              {
                tool,
                query: command,
                requestReason: command,
                sessionId: sessionId ?? 'unknown',
                agentId: agent.id,
                dataClassification: 'sensitive',
                sampleData,
              },
              command,
            );
          },
          onProgress: subAgentProgressHandler,
        },
        embedder,
        enableReflection: true,
        userContentBlocks: contentBlocks,
      });

      if (assistantMessageId !== null) {
        const hadNoChunks = assistantDraft === 'Thinking…' || !assistantDraft;
        const finalAssistantText = hadNoChunks
          ? (result.response || assistantDraft)
          : stripToolMarkup(
            assistantDraft !== 'Thinking…' ? assistantDraft : (result.response || assistantDraft),
          );
        assistantDraft = finalAssistantText;
        await flushAssistantDraft(finalAssistantText, result.tokensOut);

        if (hadNoChunks && result.response) {
          send(ws, { type: 'chunk', delta: result.response });
        }
      }

      // Send captured reasoning separately if it contains tool calls
      if (capturedReasoning && capturedReasoning.includes('"tool"')) {
        send(ws, { type: 'reasoning', content: capturedReasoning });
      }

      // Check for auto-TTS audio from pipeline hook
      try {
        const { getStoredSideEffect } = await import('../pipeline/manager.ts');
        const audioEffect = getStoredSideEffect(sessionId, `voice_audio_${result.turnId}`);
        if (audioEffect) {
          const ae = audioEffect as { url: string; format: string };
          // Extract base64 data from data URL
          const b64match = ae.url.match(/^data:audio\/\w+;base64,(.+)$/);
          if (b64match) {
            send(ws, { type: 'audio', data: b64match[1], format: ae.format });
          }
        }
      } catch {
        // Voice audio not available
      }

      send(ws, {
        type: 'done',
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
        durationMs: result.durationMs,
        model,
        reasoningEffort: reasoningEffort ?? null,
        finalContent: assistantDraft,
        requestedModelMode,
        resolvedProvider: providerKind,
        resolvedModel: model,
        autoFallback,
        autoFallbackReason: autoFallbackReason ?? null,
      });

      try {
        const byRole = await sessionDbRef!.all<{ role: string; total: number }>(
          `SELECT role, COALESCE(SUM(token_count), 0) as total FROM session_messages GROUP BY role`,
        );
        const usedTokens = byRole.reduce((sum, r) => sum + r.total, 0);
        const maxContext = config.providers[providerKind]?.contextWindow ??
          PROVIDER_DEFAULT_CONTEXT_WINDOWS[providerKind] ??
          200_000;
        const userTokens = byRole.find((r) => r.role === 'user')?.total ?? 0;
        const assistantTokens = byRole.find((r) => r.role === 'assistant')?.total ?? 0;
        const sysPromptTokens = Math.max(1, Math.round((systemPrompt?.length ?? 0) / 3.5));
        const reasoningTokens = reasoningEffort
          ? Math.round(
            assistantTokens *
              (reasoningEffort === 'high' ? 0.5 : reasoningEffort === 'medium' ? 0.25 : 0.1),
          )
          : 0;
        const totalWithOverhead = usedTokens + sysPromptTokens + reasoningTokens;
        const percentage = Math.min(100, Math.round((totalWithOverhead / maxContext) * 100));
        send(ws, {
          type: 'context_usage',
          usedTokens: totalWithOverhead,
          maxContext,
          percentage,
          breakdown: {
            systemPrompt: sysPromptTokens,
            userMessages: userTokens,
            assistantMessages: assistantTokens,
            reasoningOverhead: reasoningTokens,
          },
        });
      } catch { /* ignore context calc errors */ }
    } catch (e) {
      send(ws, { type: 'error', error: (e as Error).message });
    }
  }

  async function ensureChatSession(agentId?: string, resumeId?: string): Promise<void> {
    if (resumeId) {
      if (sessionId === resumeId) {
        if (!sessionDbRef) {
          sessionDbRef = await initSessionDb(sessionId);
        }
        return;
      }
      const agent = await resolveAgent(agentId);
      activeAgent = agent;
      sessionId = resumeId;
      wsClients.set(ws, { sessionId });
      sessionDbRef = await initSessionDb(sessionId);
      await resumeSession(sessionId);
      send(ws, { type: 'session', sessionId, agentId: agent.id, agentName: agent.name });
      _log.info(`Resumed session after reconnect`, { sessionId, agentName: agent.name });
      return;
    }
    if (sessionId) {
      if (!sessionDbRef) {
        sessionDbRef = await initSessionDb(sessionId);
      }
      return;
    }

    const agent = await resolveAgent(agentId);
    activeAgent = agent;
    sessionId = `sess_${Date.now().toString(36)}_ws`;
    wsClients.set(ws, { sessionId });
    sessionDbRef = await initSessionDb(sessionId);
    await createSession(sessionId, 'web', undefined, agent.id);
    await logEvent({
      event_type: 'session_start',
      session_id: sessionId,
      actor: 'user',
      action: 'session_start',
      summary: `WebSocket session started with agent "${agent.name}"`,
      started_at: new Date().toISOString(),
    });
    send(ws, { type: 'session', sessionId, agentId: agent.id, agentName: agent.name });
  }

  ws.onmessage = async (event: MessageEvent) => {
    let msg: WsMsg;
    try {
      msg = JSON.parse(event.data as string) as WsMsg;
    } catch {
      send(ws, { type: 'error', error: 'Invalid JSON' });
      return;
    }

    if (msg.type === 'ping') {
      send(ws, { type: 'pong' });
      return;
    }

    // Handle approval responses from Web UI
    if (msg.type === 'approval_response') {
      const resolver = pendingApprovals.get(msg.requestId);
      if (resolver) {
        resolver(msg.approved);
        pendingApprovals.delete(msg.requestId);
      }
      return;
    }

    // Select agent for this WebSocket session
    if (msg.type === 'select_agent') {
      const { getAgent } = await import('../agent/manager.ts');
      const agent = await getAgent(msg.agentId);
      if (agent) {
        activeAgent = agent;
        send(ws, { type: 'agent_selected', agentId: agent.id, agentName: agent.name });
      } else {
        send(ws, { type: 'error', error: `Agent "${msg.agentId}" not found` });
      }
      return;
    }

    // New session — reset session state without closing WS
    if (msg.type === 'new_session') {
      if (sessionId && sessionDbRef) {
        await Promise.allSettled([
          closeSession(sessionId),
          logEvent({
            event_type: 'session_end',
            session_id: sessionId,
            actor: 'system',
            action: 'session_end',
            summary: 'Session ended via new_session',
            started_at: new Date().toISOString(),
          }),
        ]);
        sessionDbRef.close();
      }
      sessionId = null;
      wsClients.set(ws, { sessionId: null });
      sessionDbRef = null;
      send(ws, { type: 'session_ended' });
      return;
    }

    // ── Voice / Audio messages ──
    if (msg.type === 'audio_chunk' && msg.session) {
      try {
        const { addAudioChunk, createVoiceSession, getVoiceSession } = await import(
          '../voice/manager.ts'
        );
        if (!getVoiceSession(sessionId ?? '')) {
          const { loadConfig } = await import('../config/config.ts');
          const config = await loadConfig();
          if (config.voice) {
            const { initVoiceSystem } = await import('../voice/manager.ts');
            await initVoiceSystem(config.voice);
            createVoiceSession(sessionId ?? '', config.voice, ws);
          }
        }
        const { decodeBase64 } = await import('../voice/audio.ts');
        const chunk = decodeBase64(msg.data);
        addAudioChunk(sessionId ?? '', chunk);
      } catch (e) {
        _log.error(`audio_chunk error`, { error: (e as Error).message });
      }
      return;
    }

    if (msg.type === 'audio_end' && msg.session) {
      try {
        const { flushAudioBuffer, getVoiceSession, initVoiceSystem } = await import(
          '../voice/manager.ts'
        );
        const { loadConfig } = await import('../config/config.ts');

        const merged = flushAudioBuffer(sessionId ?? '');
        if (!merged) {
          send(ws, { type: 'error', error: 'No audio data to transcribe' });
          return;
        }

        const config = await loadConfig();
        if (config.voice) await initVoiceSystem(config.voice);

        const { detectAudioFormat } = await import('../voice/audio.ts');
        const format = detectAudioFormat(merged);
        const session = getVoiceSession(sessionId ?? '');
        const language = session?.language ?? config.voice?.language;

        const { getSTT } = await import('../voice/manager.ts');
        const stt = getSTT();
        if (!stt) {
          send(ws, { type: 'error', error: 'STT provider not available' });
          return;
        }

        const utterance = await stt.transcribe(
          { format, data: merged },
          { language: language && language !== 'auto' ? language : undefined },
        );

        send(ws, { type: 'transcribed', text: utterance.text, confidence: utterance.confidence });

        // Process the transcribed text through the agent
        await processChatMessage(
          utterance.text,
          ws,
          activeAgent?.id,
          undefined,
          undefined,
          undefined,
          sessionId ?? undefined,
          undefined,
        );
      } catch (e) {
        send(ws, { type: 'error', error: `Transcription failed: ${(e as Error).message}` });
      }
      return;
    }

    if (msg.type === 'speak') {
      try {
        const { initVoiceSystem, getTTS } = await import('../voice/manager.ts');
        const { loadConfig } = await import('../config/config.ts');
        const { encodeBase64 } = await import('../voice/audio.ts');

        const config = await loadConfig();
        if (config.voice) {
          await initVoiceSystem(config.voice);
        }

        const tts = getTTS();
        if (!tts) {
          send(ws, { type: 'error', error: 'TTS provider not available' });
          return;
        }

        const voice = msg.voice ?? config.voice?.defaultVoice ?? 'alloy';
        const audio = await tts.synthesize(msg.text, { voice, format: 'mp3' });

        send(ws, {
          type: 'audio',
          data: encodeBase64(audio.data),
          format: audio.format,
        });
      } catch (e) {
        send(ws, { type: 'error', error: `TTS failed: ${(e as Error).message}` });
      }
      return;
    }

    if (msg.type === 'voice_state') {
      try {
        const { setSpeaking } = await import('../voice/manager.ts');
        setSpeaking(sessionId ?? '', msg.speaking);
        broadcast(
          { type: 'voice_state', sessionId, speaking: msg.speaking },
          sessionId ?? undefined,
        );
      } catch (e) {
        _log.error(`voice_state error`, { error: (e as Error).message });
      }
      return;
    }

    if (msg.type === 'chat') {
      if (!msg.message?.trim() && (!msg.files || msg.files.length === 0)) {
        send(ws, { type: 'error', error: 'Empty message' });
        return;
      }
      await ensureChatSession(msg.agentId, msg.sessionId);
      turnInFlight = true;
      if (sessionDbRef && sessionId) {
        const attachments = msg.files?.length
          ? ` [Files: ${msg.files.map((f) => f.filename).join(', ')}]`
          : '';
        const pendingUserMessage = `${msg.message ?? ''}${attachments}`.trim() ||
          '(attachment upload)';
        await sessionDbRef.insert(
          `INSERT INTO session_messages (role, content, token_count) VALUES (?, ?, ?)`,
          ['user', pendingUserMessage, null],
        ).catch(() => {});
        assistantDraft = 'Thinking…';
        assistantMessageId = await sessionDbRef.insert(
          `INSERT INTO session_messages (role, content, token_count) VALUES (?, ?, ?)`,
          ['assistant', assistantDraft, null],
        ).catch(() => 0);
      }
      try {
        await processChatMessage(
          msg.message,
          ws,
          msg.agentId,
          msg.model,
          msg.reasoningEffort,
          msg.files,
          msg.sessionId,
          msg.modelMode,
        );
      } finally {
        turnInFlight = false;
        clearAssistantFlushTimer();
        if (assistantMessageId !== null) {
          await flushAssistantDraft(undefined, undefined);
        }
        if (closeAfterTurn && sessionId && sessionDbRef) {
          closeAfterTurn = false;
          sessionDbRef.close();
        }
        assistantMessageId = null;
        assistantDraft = '';
      }
      return;
    }
  };

  ws.onerror = (_e: Event | ErrorEvent) => {
    send(ws, { type: 'error', error: 'WebSocket error' });
  };

  return response;
}
