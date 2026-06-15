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
import { fileReadTool } from '../tools/builtin/file_read.ts';
import { webSearchTool } from '../tools/builtin/web_search.ts';
import { shellTool } from '../tools/builtin/shell.ts';
import { codeExecTool } from '../tools/builtin/code_exec.ts';
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
import {
  githubPRCreateTool,
  githubPRListTool,
  githubIssueCreateTool,
  githubIssueListTool,
  gitPushTool,
} from '../tools/builtin/github/index.ts';

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

    // Build tool registry
    const registry = new ToolRegistry();
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
      shell: shellTool,
      code_exec: codeExecTool,
      github_pr_create: githubPRCreateTool,
      github_pr_list: githubPRListTool,
      github_issue_create: githubIssueCreateTool,
      github_issue_list: githubIssueListTool,
      git_push: gitPushTool,
    };
    const allowedTools = config.config.tools?.length
      ? config.config.tools
      : (agentConfig.tools?.length ? agentConfig.tools : Object.keys(allTools));
    for (const name of allowedTools) {
      if (allTools[name]) registry.register(allTools[name]);
    }

    const embedder = buildEmbedder(cortexConfig);

    // Create a session for this sub-task
    const sessionId = `sub_${taskId}_${Date.now().toString(36)}`;
    const sessionType = config.subAgentType
      ? `subagent:${config.subAgentType}`
      : 'subagent';
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
