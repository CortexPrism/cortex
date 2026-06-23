import { err, json, notFound, type RouteHandler } from './_helpers.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/workflows$/,
    handler: async () => {
      const { listWorkflows } = await import('../../workflow/engine.ts');
      const { listPlans } = await import('../../agent/planner.ts');
      const workflows = listWorkflows();
      const plans = listPlans(undefined, 10);
      return json({ workflows, plans });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/workflows\/plans$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const { listPlans } = await import('../../agent/planner.ts');
      const sessionId = url.searchParams.get('sessionId');
      return json(listPlans(sessionId || undefined));
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/workflows\/drift$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const sessionId = url.searchParams.get('sessionId');
      const { getRecentDrift } = await import('../../agent/drift-detector.ts');
      return json(getRecentDrift(sessionId || undefined, 20));
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/workflows\/tasks$/,
    handler: async () => {
      const { getSubAgentTaskBoard } = await import('../../agent/sub-agent-tracker.ts');
      return json(getSubAgentTaskBoard());
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/workflows$/,
    handler: async (req) => {
      const body = await req.json() as { name: string; description?: string; definition?: unknown };
      if (!body.name) return err('name is required', 400);
      const { Workflow, registerWorkflow } = await import('../../workflow/engine.ts');
      const wf = new Workflow(body.name, body.description);
      if (body.definition && Array.isArray(body.definition)) {
        for (const node of body.definition as Array<Record<string, unknown>>) {
          if (node.kind === 'step') {
            const stepName = node.name as string;
            const tool = node.tool as string | undefined;
            const args = (node.args ?? node.params ?? {}) as Record<string, unknown>;
            const action = node.action as string | undefined;
            wf.step(stepName, async (ctx) => {
              if (tool) {
                const { globalRegistry } = await import('../../tools/registry.ts');
                const t = globalRegistry.get(tool);
                if (!t) throw new Error(`Tool not found: ${tool}`);
                const result = await t.execute(args, {
                  sessionId: `wf_${wf.name}`,
                  agentId: 'workflow-engine',
                  workingDir: Deno.cwd(),
                  workspaceDir: Deno.cwd(),
                });
                ctx.set(`${stepName}_result`, result.output);
                if (!result.success) throw new Error(result.error ?? `Step ${stepName} failed`);
              } else if (action) {
                ctx.set(`${stepName}_result`, { action, args, executed: true });
              }
            });
          } else if (node.kind === 'goto') wf.goto(node.target as string);
        }
      }
      registerWorkflow(wf);
      return json({ ok: true, name: body.name, description: body.description }, 201);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/workflows\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/workflows\/([^/]+)$/);
      if (!m) return notFound();
      const { getWorkflow } = await import('../../workflow/engine.ts');
      const wf = getWorkflow(m[1]);
      if (!wf) return notFound('Workflow not found');
      return json({
        name: wf.name,
        description: (wf as unknown as Record<string, unknown>).description,
      });
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/workflows\/([^/]+)$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/workflows\/([^/]+)$/);
      if (!m) return notFound();
      const body = await req.json() as { name?: string; definition?: unknown };
      const { getWorkflow } = await import('../../workflow/engine.ts');
      const wf = getWorkflow(m[1]);
      if (!wf) return notFound('Workflow not found');
      return json({ ok: true });
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/workflows\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/workflows\/([^/]+)$/);
      if (!m) return notFound();
      const { deleteWorkflow } = await import('../../workflow/engine.ts');
      const deleted = deleteWorkflow(m[1]);
      if (!deleted) return notFound('Workflow not found');
      return json({ ok: true });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/workflows\/([^/]+)\/run$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/workflows\/([^/]+)\/run$/);
      if (!m) return notFound();
      const { getWorkflow, recordWorkflowRun } = await import('../../workflow/engine.ts');
      const wf = getWorkflow(m[1]);
      if (!wf) return notFound('Workflow not found');
      try {
        const result = await wf.execute();
        await recordWorkflowRun(result);
        return json(result);
      } catch (e) {
        return err((e as Error).message, 500);
      }
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/workflows\/runs$/,
    handler: async () => {
      const { listWorkflowRuns } = await import('../../workflow/engine.ts');
      return json(await listWorkflowRuns());
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/workflows\/approvals$/,
    handler: async () => {
      const { listWorkflows, getWorkflow } = await import('../../workflow/engine.ts');
      const names = listWorkflows().map((w) => w.name);
      const pending: { name: string; timestamp: string }[] = [];
      for (const name of names) {
        const wf = getWorkflow(name);
        if (wf && (wf as unknown as Record<string, unknown>).pendingApproval) {
          pending.push({ name, timestamp: new Date().toISOString() });
        }
      }
      return json(pending);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/workflows\/approvals\/([^/]+)$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/workflows\/approvals\/([^/]+)$/);
      if (!m) return notFound();
      const name = m[1];
      const body = await req.json() as { decision?: string };
      const { getWorkflow } = await import('../../workflow/engine.ts');
      const wf = getWorkflow(name);
      if (!wf) return notFound('Workflow not found');
      if (!(wf as unknown as Record<string, unknown>).pendingApproval) {
        return json({ error: 'No pending approval for this workflow' }, 400);
      }
      if (body.decision === 'approve') {
        wf.approve();
        return json({ ok: true, name, decision: 'approved' });
      }
      return json({ ok: true, name, decision: 'rejected' });
    },
  },
];
