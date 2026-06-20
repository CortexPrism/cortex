#!/usr/bin/env deno run --allow-all
/**
 * Service process entry point.
 * Runs as a persistent micro-service, listening for tasks via a Unix socket.
 * Each service runs as a named agent with its own configuration.
 *
 * Arguments:
 *   --service-id <id>   The service definition ID
 *   --port <port>       Optional HTTP port for REST API
 */

import { parse } from 'jsr:@std/flags@^0.225.3';
import { getService } from '../services/manager.ts';
import { agentTurn } from '../agent/loop.ts';
import { buildProvider } from '../llm/router.ts';
import { loadConfig } from '../config/config.ts';
import type { AgentConfig } from '../config/config.ts';
import { buildSystemPrompt } from '../agent/soul.ts';
import { ToolRegistry } from '../tools/registry.ts';
import type { Tool } from '../tools/types.ts';
import { buildEmbedder } from '../memory/embeddings.ts';
import { requestHumanApproval } from '../security/approval.ts';
import { initSessionDb } from '../db/migrate.ts';
import { createSession } from '../db/sessions.ts';
import { runMigrations } from '../db/migrate.ts';
import { getDefaultAgent, loadAgentIdentity } from '../agent/manager.ts';

const flags = parse(Deno.args, {
  string: ['service-id', 'port'],
});

async function main(): Promise<void> {
  const serviceId = flags['service-id'];
  if (!serviceId) {
    console.error('[service] --service-id is required');
    Deno.exit(1);
  }

  const port = Number(flags['port'] || 0);

  Deno.env.set('CORTEX_NOLENS', '1');
  await runMigrations();
  const def = await getService(serviceId);
  if (!def) {
    console.error(`[service] Service "${serviceId}" not found`);
    Deno.exit(1);
  }

  console.log(`[service] Starting service "${def.name}" (${serviceId})`);

  const cortexConfig = await loadConfig();

  // Resolve provider and model
  const providerKind = def.provider || cortexConfig.defaultProvider;
  const provider = buildProvider({
    ...cortexConfig,
    defaultProvider: providerKind as never,
  });
  const model = def.model || cortexConfig.providers[providerKind]?.model || 'unknown';
  const reasoningEffort = cortexConfig.providers[providerKind]?.reasoningEffort;

  // Load agent identity
  let agent: AgentConfig;
  if (def.agentId) {
    const { getAgent } = await import('../agent/manager.ts');
    const found = await getAgent(def.agentId);
    agent = found ?? await getDefaultAgent();
  } else {
    agent = await getDefaultAgent();
  }

  const identity = await loadAgentIdentity(agent);
  const systemPrompt = buildSystemPrompt(
    identity.soul,
    def.systemPrompt || agent.systemPrompt,
    identity.user,
    identity.memory,
  );

  // Tool registry (centralized registration)
  const registry = new ToolRegistry();
  const { registerAllBuiltins } = await import('../tools/registry.ts');
  const allTools = await registerAllBuiltins(registry, false); // Exclude codegraph for services

  // Filter to service-specified tools if provided
  const toolList = def.tools
    ? def.tools.split(',').map((s) => s.trim()).filter(Boolean)
    : Object.keys(allTools);

  if (def.tools) {
    // Clear registry and re-register only allowed tools
    for (const name of Object.keys(allTools)) {
      registry.unregister(name);
    }
    for (const name of toolList) {
      if (allTools[name]) {
        registry.register(allTools[name]);
      }
    }
  }

  const embedder = buildEmbedder(cortexConfig);

  console.log(`[service] Agent: ${agent.name}, Provider: ${providerKind}, Model: ${model}`);
  console.log(`[service] Tools: ${toolList.join(', ')}`);

  if (port > 0) {
    // Start an HTTP server for this service
    console.log(`[service] HTTP endpoint on port ${port}`);
    const handler = async (req: Request): Promise<Response> => {
      const url = new URL(req.url);
      if (req.method === 'POST' && url.pathname === '/chat') {
        try {
          const body = await req.json() as { message: string; sessionId?: string };
          const sessionId = `svc_${serviceId}_${Date.now().toString(36)}`;
          const sessionDb = await initSessionDb(sessionId);
          await createSession(sessionId, 'service');

          const result = await agentTurn({
            userMessage: body.message,
            provider: provider!,
            model,
            sessionDb,
            sessionId,
            systemPrompt,
            stream: false,
            reasoningEffort,
            registry,
            toolContext: {
              workingDir: Deno.cwd(),
              agentId: agent.id,
              workspaceDir: Deno.cwd(),
              model,
              provider: providerKind as import('../config/config.ts').ProviderKind,
              approvalGate: async (tool: string, command: string, sampleData?: string) => {
                return await requestHumanApproval(
                  {
                    tool,
                    query: command,
                    requestReason: command,
                    sessionId,
                    agentId: agent.id,
                    dataClassification: 'sensitive',
                    sampleData,
                  },
                  command,
                );
              },
            },
            embedder,
          });

          sessionDb.close();
          return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (e) {
          return new Response(JSON.stringify({ error: (e as Error).message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      // Health check
      if (req.method === 'GET' && url.pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok', service: serviceId }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response('Not found', { status: 404 });
    };

    Deno.serve({ port }, handler);
  } else {
    // No HTTP port — just keep alive, waiting for future IPC tasks
    // For now, just signal ready and idle
    console.log(`[service] Running in headless mode (no HTTP)`);
    await new Promise(() => {}); // never resolves
  }
}

main().catch((e) => {
  console.error(`[service] Fatal: ${(e as Error).message}`);
  Deno.exit(1);
});
