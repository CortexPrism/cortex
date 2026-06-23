import { err, json, notFound, type RouteHandler } from './_helpers.ts';
import { loadConfig } from '../../config/config.ts';
import { getMemoryDb } from '../../db/client.ts';
import { getSession, updateSessionProgress } from '../../db/sessions.ts';

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
      const limit = Number(url.searchParams.get('limit') ?? 20);
      try {
        const db = await (await import('../../db/client.ts')).getCoreDb();
        const { listCheckpoints } = await import('../../memori/store.ts');
        const checkpoints = await listCheckpoints(db, { sessionId, limit });
        return json({ checkpoints });
      } catch {
        return json({ checkpoints: [] });
      }
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
      const checkpoint = await loadCheckpoint(await getMemoryDb(), checkpointId);
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
    pattern: /^\/api\/pkm$/,
    handler: async () => {
      const { listPkmConnections, getImportFormats } = await import('../../pkm-connectors.ts');
      return json({ connections: listPkmConnections(), formats: getImportFormats() });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/pkm\/connect$/,
    handler: async (req) => {
      const body = await req.json() as { kind: string; path: string; name?: string };
      if (!body.kind || !body.path) return err('kind and path required', 400);
      const { connectPkm } = await import('../../pkm-connectors.ts');
      const conn = connectPkm(
        body.kind as 'obsidian' | 'logseq' | 'notion' | 'roam',
        body.path,
        body.name || body.path,
      );
      return json(conn, 201);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/pkm\/sync$/,
    handler: async (req) => {
      const body = await req.json() as { id: string };
      if (!body.id) return err('id required', 400);
      const { syncPkm } = await import('../../pkm-connectors.ts');
      try {
        return json(await syncPkm(body.id));
      } catch (e) {
        return err((e as Error).message, 400);
      }
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/glossary$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const { listTerms, getCategories } = await import('../../memory/glossary.ts');
      const category = url.searchParams.get('category');
      const [terms, categories] = await Promise.all([
        listTerms(category || undefined),
        getCategories(),
      ]);
      return json({ terms, categories });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/glossary$/,
    handler: async (req) => {
      const body = await req.json() as {
        name: string;
        definition: string;
        category?: string;
        aliases?: string[];
      };
      if (!body.name || !body.definition) return err('name and definition required', 400);
      const { defineTerm } = await import('../../memory/glossary.ts');
      await defineTerm(body.name, body.definition, body.category || 'general', body.aliases ?? []);
      return json({ ok: true }, 201);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/prompts$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const { listPromptTemplates, listPromptRuns, getPromptStats } = await import(
        '../../prompt-lab.ts'
      );
      const templateId = url.searchParams.get('templateId');
      const tag = url.searchParams.get('tag') || undefined;
      return json({
        templates: listPromptTemplates(tag),
        runs: listPromptRuns(templateId || undefined),
        stats: getPromptStats(),
      });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/prompts\/([^/]+)$/,
    handler: async (req) => {
      const id = new URL(req.url).pathname.split('/').pop()!;
      const { getPromptTemplate, listPromptRuns, listABTests } = await import(
        '../../prompt-lab.ts'
      );
      const tpl = getPromptTemplate(id);
      if (!tpl) return notFound('Template not found');
      return json({
        ...tpl,
        runs: listPromptRuns(id),
        abTests: listABTests(id),
      });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/prompts$/,
    handler: async (req) => {
      const body = await req.json() as {
        name: string;
        content: string;
        tags?: string[];
      };
      if (!body.name || !body.content) return err('name and content required', 400);
      const { createPromptTemplate } = await import('../../prompt-lab.ts');
      const tpl = createPromptTemplate(body.name, body.content, body.tags);
      return json(tpl, 201);
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/prompts\/([^/]+)$/,
    handler: async (req) => {
      const id = new URL(req.url).pathname.split('/').pop()!;
      const body = await req.json() as {
        content: string;
        name?: string;
        tags?: string[];
      };
      if (!body.content) return err('content required', 400);
      const { updatePromptTemplate } = await import('../../prompt-lab.ts');
      const tpl = updatePromptTemplate(id, body.content, body.name, body.tags);
      if (!tpl) return notFound('Template not found');
      return json(tpl);
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/prompts\/([^/]+)$/,
    handler: async (req) => {
      const id = new URL(req.url).pathname.split('/').pop()!;
      const { deletePromptTemplate } = await import('../../prompt-lab.ts');
      const ok = deletePromptTemplate(id);
      if (!ok) return notFound('Template not found');
      return json({ ok: true });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/prompts\/runs$/,
    handler: async (req) => {
      const body = await req.json() as {
        templateId: string;
        model: string;
        input: string;
        output: string;
        score?: number;
        abTestId?: string;
        variant?: 'A' | 'B';
        latencyMs?: number;
        tokensUsed?: number;
      };
      if (!body.templateId || !body.input || !body.output) {
        return err('templateId, input, and output required', 400);
      }
      const { recordPromptRun } = await import('../../prompt-lab.ts');
      const run = recordPromptRun(
        body.templateId,
        body.model || 'default',
        body.input,
        body.output,
        body.score,
        {
          abTestId: body.abTestId,
          variant: body.variant,
          latencyMs: body.latencyMs,
          tokensUsed: body.tokensUsed,
        },
      );
      return json(run, 201);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/prompts\/ab-tests$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const { listABTests } = await import('../../prompt-lab.ts');
      const templateId = url.searchParams.get('templateId') || undefined;
      return json({ abTests: listABTests(templateId) });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/prompts\/ab-tests$/,
    handler: async (req) => {
      const body = await req.json() as {
        name: string;
        templateId: string;
        variantA: string;
        variantB: string;
      };
      if (!body.name || !body.templateId || !body.variantA || !body.variantB) {
        return err('name, templateId, variantA, and variantB required', 400);
      }
      const { createABTest, getPromptTemplate } = await import('../../prompt-lab.ts');
      if (!getPromptTemplate(body.templateId)) return err('Template not found', 404);
      const test = createABTest(body.name, body.templateId, body.variantA, body.variantB);
      return json(test, 201);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/prompts\/ab-tests\/([^/]+)$/,
    handler: async (req) => {
      const id = new URL(req.url).pathname.split('/').pop()!;
      const { getABTest, getABTestStats, listPromptRuns } = await import('../../prompt-lab.ts');
      const test = getABTest(id);
      if (!test) return notFound('AB test not found');
      return json({
        ...test,
        stats: getABTestStats(id),
        runs: listPromptRuns(undefined, 100, id),
      });
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/prompts\/ab-tests\/([^/]+)$/,
    handler: async (req) => {
      const id = new URL(req.url).pathname.split('/').pop()!;
      const body = await req.json() as { status: 'running' | 'completed' | 'paused' };
      if (!body.status) return err('status required', 400);
      const { updateABTestStatus } = await import('../../prompt-lab.ts');
      const test = updateABTestStatus(id, body.status);
      if (!test) return notFound('AB test not found');
      return json(test);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/prompts\/generate$/,
    handler: async (req) => {
      const body = await req.json() as {
        task: string;
        role?: string;
        tone?: string;
        style?: string;
        length?: string;
        constraints?: string[];
        examples?: string[];
        baseTemplate?: string;
      };
      if (!body.task) return err('task required', 400);
      const { generatePromptFromRequest } = await import('../../prompt-lab.ts');
      const prompt = generatePromptFromRequest(body);
      return json({ prompt });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/prompts\/variations$/,
    handler: async (req) => {
      const body = await req.json() as { content: string; count?: number };
      if (!body.content) return err('content required', 400);
      const { generatePromptVariations } = await import('../../prompt-lab.ts');
      const variations = generatePromptVariations(body.content, body.count || 3);
      return json({ variations });
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
];
