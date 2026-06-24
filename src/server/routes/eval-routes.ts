import { err, json, notFound, type RouteHandler } from './_helpers.ts';
import { loadConfig } from '../../config/config.ts';
import { getCoreDb } from '../../db/client.ts';
import { createSession, getSession, updateSessionProgress } from '../../db/sessions.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/memori\/preview$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const sessionId = url.searchParams.get('sessionId');
      if (!sessionId) return err('sessionId required', 400);
      try {
        const db = await (await import('../../db/client.ts')).getCoreDb();
        const { listCheckpoints } = await import('../../memori/store.ts');
        const checkpoints = await listCheckpoints(db, { sessionId, limit: 5 });
        return json({ sessionId, checkpoints });
      } catch {
        return json({ sessionId, checkpoints: [] });
      }
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/memori\/checkpoints$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const sessionId = url.searchParams.get('sessionId') || undefined;
      const agentId = url.searchParams.get('agentId') || undefined;
      const limit = Number(url.searchParams.get('limit') ?? 20);
      try {
        const db = await getCoreDb();
        const { listCheckpoints } = await import('../../memori/store.ts');
        const checkpoints = await listCheckpoints(db, { sessionId, agentId, limit });
        return json({ checkpoints });
      } catch {
        return json({ checkpoints: [] });
      }
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/memori\/checkpoints\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/memori\/checkpoints\/([^/]+)$/);
      if (!m) return notFound();
      const { loadCheckpoint } = await import('../../memori/store.ts');
      const checkpoint = await loadCheckpoint(await getCoreDb(), m[1]);
      if (!checkpoint) return notFound('Checkpoint not found');
      return json(checkpoint);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/memori\/checkpoints\/([^/]+)\/fork$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/memori\/checkpoints\/([^/]+)\/fork$/);
      if (!m) return notFound();
      const checkpointId = m[1];
      const body = await req.json().catch(() => ({})) as { name?: string };
      const { loadCheckpoint, saveCheckpoint } = await import('../../memori/store.ts');
      const { buildResumePrompt, restoreCheckpoint } = await import('../../memori/restore.ts');
      const coreDb = await getCoreDb();
      const checkpoint = await loadCheckpoint(coreDb, checkpointId);
      if (!checkpoint) return notFound('Checkpoint not found');
      const sourceSession = await getSession(checkpoint.sessionId);
      if (!sourceSession) return notFound('Source session not found');
      const newSessionId = `fork_${checkpoint.sessionId.slice(0, 16)}_t${checkpoint.turnNumber}_${
        Date.now().toString(36)
      }`;
      const forkName = body.name ??
        `Fork of turn ${checkpoint.turnNumber} (${
          sourceSession.name ?? checkpoint.sessionId.slice(0, 8)
        })`;
      await createSession(
        newSessionId,
        sourceSession.channel,
        forkName,
        checkpoint.agentId,
        checkpoint.sessionId,
      );
      const restored = restoreCheckpoint(checkpoint);
      const resumePrompt =
        `[Forked from session ${checkpoint.sessionId} at turn ${checkpoint.turnNumber}]\n\n` +
        buildResumePrompt(restored) +
        (restored.toolCallHistory.length > 0
          ? `\n\n## Tool History\n${
            restored.toolCallHistory.map((t) => `- ${t.toolName}`).join('\n')
          }`
          : '');
      const { initSessionDb } = await import('../../db/migrate.ts');
      const sessionDb = await initSessionDb(newSessionId);
      await sessionDb.exec('BEGIN IMMEDIATE');
      try {
        await sessionDb.run(
          `INSERT INTO session_messages (role, content, token_count, created_at) VALUES (?, ?, ?, ?)`,
          ['system', resumePrompt, null, checkpoint.timestamp],
        );
        for (const message of checkpoint.conversation.messages) {
          await sessionDb.run(
            `INSERT INTO session_messages (role, content, token_count, created_at) VALUES (?, ?, ?, ?)`,
            [message.role, message.content, null, message.timestamp ?? checkpoint.timestamp],
          );
        }
        await sessionDb.exec('COMMIT');
      } catch (e) {
        await sessionDb.exec('ROLLBACK').catch(() => {});
        throw e;
      }
      await updateSessionProgress(
        newSessionId,
        checkpoint.turnNumber,
        checkpoint.timestamp,
        checkpoint.agentId,
      );
      const forkedCheckpoint = {
        ...checkpoint,
        id: `${checkpoint.id}_fork_${newSessionId.slice(-8)}`,
        sessionId: newSessionId,
        agentId: checkpoint.agentId,
      };
      await saveCheckpoint(coreDb, forkedCheckpoint);
      return json({
        success: true,
        newSessionId,
        forkName,
        sourceSessionId: checkpoint.sessionId,
        checkpointId,
        turnNumber: checkpoint.turnNumber,
      }, 201);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/memori\/checkpoints\/([^/]+)\/restore$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/memori\/checkpoints\/([^/]+)\/restore$/);
      if (!m) return notFound();
      const checkpointId = m[1];
      const { loadCheckpoint } = await import('../../memori/store.ts');
      const { buildResumePrompt, restoreCheckpoint } = await import('../../memori/restore.ts');
      const checkpoint = await loadCheckpoint(await getCoreDb(), checkpointId);
      if (!checkpoint) return notFound('Checkpoint not found');
      const restored = restoreCheckpoint(checkpoint);
      const resumePrompt = buildResumePrompt(restored) +
        (restored.toolCallHistory.length > 0
          ? `\n\n## Tool History\n${
            restored.toolCallHistory.map((t) => `- ${t.toolName}`).join('\n')
          }`
          : '');
      const session = await getSession(checkpoint.sessionId);
      if (!session) return notFound('Session not found');
      const { initSessionDb } = await import('../../db/migrate.ts');
      const db = await initSessionDb(checkpoint.sessionId);
      await db.exec('BEGIN IMMEDIATE');
      try {
        await db.run('DELETE FROM session_messages');
        await db.run(
          `INSERT INTO session_messages (role, content, token_count, created_at) VALUES (?, ?, ?, ?)`,
          ['system', resumePrompt, null, checkpoint.timestamp],
        );
        for (const message of checkpoint.conversation.messages) {
          await db.run(
            `INSERT INTO session_messages (role, content, token_count, created_at) VALUES (?, ?, ?, ?)`,
            [message.role, message.content, null, message.timestamp ?? checkpoint.timestamp],
          );
        }
        await db.exec('COMMIT');
      } catch (e) {
        await db.exec('ROLLBACK').catch(() => {});
        throw e;
      }
      await updateSessionProgress(
        checkpoint.sessionId,
        checkpoint.turnNumber,
        checkpoint.timestamp,
        checkpoint.agentId,
      );
      return json({
        success: true,
        sessionId: checkpoint.sessionId,
        checkpointId,
        turnNumber: checkpoint.turnNumber,
      });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/eval\/suites$/,
    handler: async () => {
      const { listSuites } = await import('../../eval/runner.ts');
      const suites = await listSuites();
      return json(suites.map((s) => ({ ...s, id: s.name })));
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/eval\/run$/,
    handler: async (req) => {
      const { getSuite, runSuite } = await import('../../eval/runner.ts');
      const body = await req.json() as {
        suiteId: string;
        agentId?: string;
        provider?: string;
        baselineId?: string;
        timeout?: number;
      };
      if (!body.suiteId) return err('Missing suiteId', 400);
      const suite = await getSuite(body.suiteId);
      if (!suite) return notFound('Suite not found');
      const config = await loadConfig();
      const provider = config.defaultProvider;
      const run = await runSuite(
        suite,
        { provider, model: config.providers[provider]?.model ?? 'unknown' } as never,
      );
      return json(run, 201);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/eval\/runs$/,
    handler: async () => {
      const { listRuns } = await import('../../eval/runner.ts');
      const runs = await listRuns();
      return json(runs);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/eval\/runs\/(.+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/eval\/runs\/(.+)$/);
      if (!m) return notFound();
      const { getRun } = await import('../../eval/runner.ts');
      const run = await getRun(m[1]);
      if (!run) return notFound('Run not found');
      return json(run);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/eval\/baselines$/,
    handler: async () => {
      const { listBaselines } = await import('../../eval/runner.ts');
      const baselines = await listBaselines();
      return json(baselines);
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/eval\/baselines\/(.+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/eval\/baselines\/(.+)$/);
      if (!m) return notFound();
      const { deleteBaseline } = await import('../../eval/runner.ts');
      await deleteBaseline(m[1]);
      return json({ ok: true });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/eval\/rag$/,
    handler: async (req) => {
      const body = await req.json() as {
        query: string;
        retrievedDocs?: string[];
        expectedDoc?: string;
      };
      if (!body.query) return err('query required', 400);
      const retrieved = body.retrievedDocs ?? [];
      const hit = body.expectedDoc && retrieved.includes(body.expectedDoc);
      return json({
        query: body.query,
        retrievedCount: retrieved.length,
        hitAt1: hit,
        recall: body.expectedDoc ? (hit ? 1 : 0) : null,
        mrr: hit ? 1 : 0,
      });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/cost\/optimizer$/,
    handler: async () => {
      const config = await loadConfig();
      const providers = Object.entries(config.providers ?? {}).map(([k, p]) => ({
        kind: k,
        model: p?.model ?? 'unknown',
        hasKey: !!(p?.apiKey || p?.baseUrl),
      }));

      let recommendation = 'Configure at least one LLM provider to receive cost recommendations.';
      try {
        const { getQmSummary } = await import('../../quartermaster/monitor.ts');
        const summary = await getQmSummary();
        const total = summary.totalObservations + summary.totalPredictions;
        if (summary && total > 0) {
          const cheapest = providers
            .filter((p) => p.hasKey)
            .find((p) => p.kind === 'ollama' || p.kind === 'lmstudio');
          if (cheapest) {
            recommendation =
              `Route low-complexity tasks to ${cheapest.kind}/${cheapest.model} to reduce cost. ` +
              `QM has made ${total} routing decisions; accuracy: ${
                ((summary.rollingAccuracy ?? 0) * 100).toFixed(1)
              }%.`;
          } else {
            recommendation = `${total} decisions recorded. ` +
              `Add a local provider (Ollama/LM Studio) to reduce per-token costs for simple tasks.`;
          }
        }
      } catch {
        // QM not available yet
      }

      return json({ providers, recommendation });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/observability\/traces$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 50);
      const otelEnabled = !!Deno.env.get('OTEL_EXPORTER_OTLP_ENDPOINT');
      const langfuseEnabled = !!Deno.env.get('LANGFUSE_PUBLIC_KEY');

      let traces: unknown[] = [];
      try {
        const { getLensDb } = await import('../../db/client.ts');
        const db = await getLensDb();
        const rows = await db.all<Record<string, unknown>>(
          `SELECT id, event_type, session_id, turn_id, actor, action, summary, started_at, payload
           FROM lens_events
           WHERE event_type IN ('llm_call','tool_call','tool_result','agent_turn')
           ORDER BY started_at DESC LIMIT ?`,
          [limit],
        );
        traces = rows.map((r) => ({
          id: r.id,
          type: r.event_type,
          sessionId: r.session_id,
          turnId: r.turn_id,
          actor: r.actor,
          action: r.action,
          summary: r.summary,
          startedAt: r.started_at,
          payload: r.payload
            ? (() => {
              try {
                return JSON.parse(r.payload as string);
              } catch {
                return {};
              }
            })()
            : {},
        }));
      } catch {
        // lens DB may not be initialised yet
      }

      return json({ traces, otelEnabled, langfuseEnabled });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/observability\/test-otlp$/,
    handler: async () => {
      const endpoint = Deno.env.get('OTEL_EXPORTER_OTLP_ENDPOINT');
      if (!endpoint) {
        return json({ ok: false, error: 'OTEL_EXPORTER_OTLP_ENDPOINT not set' }, 400);
      }
      try {
        const res = await fetch(`${endpoint.replace(/\/$/, '')}/v1/traces`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(Deno.env.get('OTEL_EXPORTER_OTLP_HEADERS')
              ? Object.fromEntries(
                Deno.env.get('OTEL_EXPORTER_OTLP_HEADERS')!.split(',').map((h) => h.split('=')),
              )
              : {}),
          },
          body: JSON.stringify({ resourceSpans: [] }),
          signal: AbortSignal.timeout(5_000),
        });
        return json({ ok: res.ok, status: res.status, endpoint });
      } catch (e) {
        return json({ ok: false, error: (e as Error).message, endpoint }, 502);
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/observability\/test-langfuse$/,
    handler: async () => {
      const publicKey = Deno.env.get('LANGFUSE_PUBLIC_KEY');
      const secretKey = Deno.env.get('LANGFUSE_SECRET_KEY');
      const host = Deno.env.get('LANGFUSE_HOST') ?? 'https://cloud.langfuse.com';
      if (!publicKey || !secretKey) {
        return json(
          { ok: false, error: 'LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY must be set' },
          400,
        );
      }
      try {
        const credentials = btoa(`${publicKey}:${secretKey}`);
        const res = await fetch(`${host}/api/public/projects`, {
          headers: { 'Authorization': `Basic ${credentials}` },
          signal: AbortSignal.timeout(5_000),
        });
        return json({ ok: res.ok, status: res.status, host });
      } catch (e) {
        return json({ ok: false, error: (e as Error).message, host }, 502);
      }
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/benchmarks$/,
    handler: async () => {
      try {
        const { listSuites } = await import('../../eval/runner.ts');
        const suites = await listSuites();
        return json({ suites: suites ?? [], comparisons: [] });
      } catch {
        return json({ suites: [], comparisons: [] });
      }
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/eval\/harnesses$/,
    handler: async () => {
      return json({
        presets: [
          {
            name: 'code-generation',
            tasks: ['write function', 'fix bug', 'refactor class'],
            scoring: 'pass@1',
          },
          {
            name: 'code-exploration',
            tasks: ['find symbol', 'trace dependency', 'explain architecture'],
            scoring: 'accuracy',
          },
          {
            name: 'qa-bench',
            tasks: ['answer question', 'cite sources', 'explain concept'],
            scoring: 'f1',
          },
          {
            name: 'security-audit',
            tasks: ['scan prompt', 'check hygiene', 'validate policy'],
            scoring: 'precision@k',
          },
        ],
        recentRuns: [],
      });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/embeddings\/pipeline$/,
    handler: async () => {
      const config = await loadConfig();
      const emb = config.embeddings;
      const active = !!(emb?.provider && emb.provider !== 'stub');
      const provider = emb?.provider ?? (
        config.providers[config.defaultProvider]?.kind === 'ollama'
          ? 'ollama'
          : config.providers['openai']?.apiKey
          ? 'openai'
          : 'stub'
      );
      return json({
        stages: ['chunk', 'embed', 'index', 'backfill'],
        backends: ['lancedb', 'chroma', 'pinecone'],
        active,
        provider,
        model: emb?.model ??
          (provider === 'ollama' ? 'nomic-embed-text' : 'text-embedding-3-small'),
        config: { chunkSize: 512, chunkOverlap: 64, batchSize: 32 },
      });
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/cache\/search$/,
    handler: async () => {
      const { clearSearchCache } = await import('../../tools/builtin/web/cache.ts');
      const cleared = await clearSearchCache();
      return json({ ok: true, cleared });
    },
  },
  // ── Memory Benchmark API ──────────────────────────────────────
  {
    method: 'GET',
    pattern: /^\/api\/eval\/memory\/results$/,
    handler: async () => {
      const { loadLatestResults } = await import('../../eval/memory-bench.ts');
      const results = await loadLatestResults();
      return results ? json(results) : json({ error: 'No results yet' }, 404);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/eval\/memory\/history$/,
    handler: async () => {
      const { loadHistory } = await import('../../eval/memory-bench.ts');
      return json(await loadHistory());
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/eval\/memory\/run$/,
    handler: async (req) => {
      try {
        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        const config = await loadConfig();
        const { buildProvider } = await import('../../llm/router.ts');
        const provider = buildProvider(config);
        if (!provider) return err('No LLM provider configured', 503);

        const { runMemoryBenchmark, LONGMEMEVAL_S_SAMPLE, loadBenchmarkFile } = await import(
          '../../eval/memory-bench.ts'
        );

        let questions = LONGMEMEVAL_S_SAMPLE;
        if (body.suitePath && typeof body.suitePath === 'string') {
          try {
            questions = await loadBenchmarkFile(body.suitePath);
          } catch (e) {
            return err(`Failed to load suite: ${(e as Error).message}`, 400);
          }
        }

        const sampleN = typeof body.sample === 'number' ? body.sample : 0;
        if (sampleN > 0 && sampleN < questions.length) {
          const arr = [...questions];
          for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
          }
          questions = arr.slice(0, sampleN);
        }

        const model = config.providers[config.defaultProvider]?.model ?? '';
        const summary = await runMemoryBenchmark({
          provider,
          model,
          providerName: config.defaultProvider,
          questions,
          concurrency: 3,
        });
        return json(summary);
      } catch (e) {
        return err(`Benchmark failed: ${(e as Error).message}`, 500);
      }
    },
  },
];
