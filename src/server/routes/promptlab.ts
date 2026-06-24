import { err, json, notFound, type RouteHandler } from './_helpers.ts';

export const routes: RouteHandler[] = [
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
];
