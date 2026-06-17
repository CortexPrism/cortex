import { logger } from '../utils/logger.ts';
import { agentTurn } from '../agent/loop.ts';
import { buildSystemPrompt, loadSoulContext } from '../agent/soul.ts';
import { closeSession, createSession, getSession, resumeSession } from '../db/sessions.ts';
import { logEvent } from '../db/lens.ts';
import { initSessionDb } from '../db/migrate.ts';
import { buildProvider, buildRouter, PROVIDER_DEFAULT_CONTEXT_WINDOWS } from '../llm/router.ts';
import { loadConfig } from '../config/config.ts';
import type { AgentConfig } from '../config/config.ts';
import type { ContentBlock } from '../llm/types.ts';
import { buildEmbedder } from '../memory/embeddings.ts';
import { globalRegistry } from '../tools/registry.ts';
import type { Tool } from '../tools/types.ts';
import { fileReadTool } from '../tools/builtin/file_read.ts';
import { webSearchTool } from '../tools/builtin/web_search.ts';
import { codeExecTool } from '../tools/builtin/code_exec.ts';
import { subAgentTool } from '../tools/builtin/sub_agent.ts';
import { nodeDispatchTool } from '../tools/builtin/node_dispatch.ts';
import { loadSkillTool } from '../tools/builtin/load_skill.ts';
import { skillWriteTool } from '../tools/builtin/skill_write.ts';
import { skillReadTool } from '../tools/builtin/skill_read.ts';
import { dashboardManageTool } from '../tools/builtin/dashboard_manage.ts';
import { memoryNoteTool } from '../tools/builtin/memory_note.ts';
import { speakTool } from '../tools/builtin/speak.ts';
import { listenTool } from '../tools/builtin/listen.ts';
import { shellTool } from '../tools/builtin/shell.ts';
import { webFetchTool } from '../tools/builtin/web_fetch.ts';
import { braveSearchTool } from '../tools/builtin/web/brave_search.ts';
import { tavilySearchTool } from '../tools/builtin/web/tavily_search.ts';
import { serpapiSearchTool } from '../tools/builtin/web/serpapi_search.ts';
import { firecrawlTool } from '../tools/builtin/web/firecrawl.ts';
import { fileGlobTool } from '../tools/builtin/workspace/file_glob.ts';
import {
  githubIssueCreateTool,
  githubIssueListTool,
  githubPRCreateTool,
  githubPRListTool,
  gitPushTool,
} from '../tools/builtin/github/index.ts';
import { onFileChange } from '../workspace/events.ts';
import {
  fileDeleteTool,
  fileEditTool,
  fileInfoTool,
  fileListTool,
  filePatchTool,
  fileRedoTool,
  fileRenameTool,
  fileSearchTool,
  fileTreeTool,
  fileUndoTool,
  fileWriteTool,
} from '../tools/builtin/workspace/index.ts';
import { getDefaultAgent, loadAgentIdentity } from '../agent/manager.ts';

const _log = logger('server:ws');

type WsMsg =
  | {
    type: 'chat';
    message: string;
    sessionId?: string;
    agentId?: string;
    model?: string;
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
  | { type: 'voice_state'; speaking: boolean };

function send(ws: WebSocket, data: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

const wsClients = new Set<WebSocket>();

function broadcast(msg: unknown): void {
  const data = JSON.stringify(msg);
  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) {
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

export async function handleWebSocket(req: Request): Promise<Response> {
  const authed = await isWsAuthenticated(req);
  if (!authed) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { socket: ws, response } = Deno.upgradeWebSocket(req);
  wsClients.add(ws);

  let sessionId: string | null = null;
  let sessionDbRef: Awaited<ReturnType<typeof initSessionDb>> | null = null;

  const unsubscribe = onFileChange((event) => {
    broadcast({ type: 'file_change', ...event });
  });

  ws.onopen = () => send(ws, { type: 'connected' });

  ws.onclose = async () => {
    wsClients.delete(ws);
    unsubscribe();
    if (sessionId && sessionDbRef) {
      await Promise.allSettled([
        closeSession(sessionId),
        logEvent({
          event_type: 'session_end',
          session_id: sessionId,
          actor: 'system',
          action: 'session_end',
          summary: 'WebSocket session closed',
          started_at: new Date().toISOString(),
        }),
      ]);
      sessionDbRef.close();
    }
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
  ): Promise<void> {
    try {
      const config = await loadConfig();
      const agent = await resolveAgent(agentId);
      activeAgent = agent;

      const providerKind = agent.provider || config.defaultProvider;
      const provider = buildProvider({ ...config, defaultProvider: providerKind as never });
      const router = buildRouter(config);
      const effectiveProvider = router ?? provider;
      const model = modelOverride || agent.model || config.providers[providerKind]?.model ||
        'unknown';
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
            sessionDbRef = await initSessionDb(sessionId);
            await resumeSession(sessionId);
            send(ws, { type: 'session', sessionId, agentId: agent.id, agentName: agent.name });
          }
        }

        if (!sessionId) {
          sessionId = `sess_${Date.now().toString(36)}_ws`;
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

      const registry = globalRegistry;
      const allTools: Record<string, Tool> = {
        file_read: fileReadTool,
        file_write: fileWriteTool,
        file_edit: fileEditTool,
        file_patch: filePatchTool,
        file_delete: fileDeleteTool,
        file_rename: fileRenameTool,
        file_list: fileListTool,
        file_tree: fileTreeTool,
        file_info: fileInfoTool,
        file_search: fileSearchTool,
        file_undo: fileUndoTool,
        file_redo: fileRedoTool,
        web_search: webSearchTool,
        code_exec: codeExecTool,
        sub_agent: subAgentTool,
        node_dispatch: nodeDispatchTool,
        github_pr_create: githubPRCreateTool,
        github_pr_list: githubPRListTool,
        github_issue_create: githubIssueCreateTool,
        github_issue_list: githubIssueListTool,
        git_push: gitPushTool,
        load_skill: loadSkillTool,
        skill_write: skillWriteTool,
        skill_read: skillReadTool,
        dashboard_manage: dashboardManageTool,
        memory_note: memoryNoteTool,
        speak: speakTool,
        listen: listenTool,
        shell: shellTool,
        web_fetch: webFetchTool,
        file_glob: fileGlobTool,
        brave_search: braveSearchTool,
        tavily_search: tavilySearchTool,
        serpapi_search: serpapiSearchTool,
        firecrawl: firecrawlTool,
      };
      const allowedTools = agent.tools?.length ? agent.tools : Object.keys(allTools);
      for (const name of allowedTools) {
        if (allTools[name]) registry.register(allTools[name]);
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
        ...providerSpecificOpts,
        onChunk: (chunk) => {
          // Capture raw reasoning/tool calls before stripping
          capturedReasoning += chunk;
          
          // Strip tool call markup using the same robust logic as loop.ts
          let safe = chunk;
          
          // Remove <tool_call>...</tool_call> blocks
          safe = safe.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '');
          safe = safe.replace(/<tool_result[\s\S]*?<\/tool_result>/g, '');
          
          // Remove bare JSON tool calls using brace-depth walker for nested JSON
          const bareToolRe = /\{\s*"(tool|name)"\s*:/g;
          let bm: RegExpExecArray | null;
          const regions: Array<[number, number]> = [];
          while ((bm = bareToolRe.exec(safe)) !== null) {
            const start = bm.index;
            let depth = 0;
            let inStr = false;
            let esc = false;
            let end = -1;
            for (let i = start; i < safe.length; i++) {
              const ch = safe[i];
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
            safe = safe.slice(0, regions[i][0]) + safe.slice(regions[i][1]);
          }
          
          // Remove fenced code blocks that contain tool call JSON
          safe = safe.replace(/```[\s\S]*?```/g, (block) => {
            return /\{\s*"(tool|name)"\s*:/.test(block) ? '' : block;
          });
          
          safe = safe.replace(/\n{3,}/g, '\n\n').trim();
          
          if (safe.trim()) send(ws, { type: 'chunk', delta: safe });
        },
        registry,
        toolContext: {
          workingDir,
          agentId: agent.id,
          workspaceDir,
        },
        embedder,
        enableReflection: true,
        userContentBlocks: contentBlocks,
      });
      
      // Send captured reasoning separately if it contains tool calls
      if (capturedReasoning && capturedReasoning.includes('"tool"')) {
        send(ws, { type: 'reasoning', content: capturedReasoning });
      }

      // Check for auto-TTS audio from pipeline hook
      try {
        const { getStoredSideEffect } = await import('../pipeline/manager.ts');
        const audioEffect = getStoredSideEffect(`voice_audio_${sessionId}_${result.turnId}`);
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
        // Broadcast voice state to other clients
        broadcast({ type: 'voice_state', sessionId, speaking: msg.speaking });
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
      await processChatMessage(
        msg.message,
        ws,
        msg.agentId,
        msg.model,
        msg.reasoningEffort,
        msg.files,
        msg.sessionId,
      );
      return;
    }
  };

  ws.onerror = (_e: Event | ErrorEvent) => {
    send(ws, { type: 'error', error: 'WebSocket error' });
  };

  return response;
}
