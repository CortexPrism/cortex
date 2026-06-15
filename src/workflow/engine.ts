type StepFn = (ctx: WorkflowContext) => Promise<void>;

interface WorkflowStep {
  name: string;
  fn: StepFn;
}

interface WorkflowBranch {
  condition: (ctx: WorkflowContext) => boolean;
  yes: Workflow;
  no: Workflow;
}

interface WorkflowParallel {
  name: string;
  steps: WorkflowStep[];
}

type WorkflowNode =
  | { kind: 'step'; step: WorkflowStep }
  | { kind: 'branch'; branch: WorkflowBranch }
  | { kind: 'parallel'; parallel: WorkflowParallel }
  | { kind: 'goto'; target: string }
  | { kind: 'wait' };

export class WorkflowContext {
  private data = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    return this.data.get(key) as T | undefined;
  }

  set(key: string, value: unknown): void {
    this.data.set(key, value);
  }

  getAll(): Record<string, unknown> {
    return Object.fromEntries(this.data);
  }
}

export interface WorkflowResult {
  name: string;
  success: boolean;
  error?: string;
  durationMs: number;
  stepsCompleted: number;
  stepsTotal: number;
  context: Record<string, unknown>;
}

export class Workflow {
  name: string;
  private nodes: WorkflowNode[] = [];

  constructor(name: string) {
    this.name = name;
  }

  step(name: string, fn: StepFn): this {
    this.nodes.push({ kind: 'step', step: { name, fn } });
    return this;
  }

  branch(
    condition: (ctx: WorkflowContext) => boolean,
    opts: { then: Workflow; else: Workflow },
  ): this {
    this.nodes.push({
      kind: 'branch',
      branch: { condition, yes: opts.then, no: opts.else },
    });
    return this;
  }

  parallel(name: string, steps: { step: string; action: StepFn }[]): this {
    const wfSteps: WorkflowStep[] = steps.map((s) => ({
      name: s.step,
      fn: s.action,
    }));
    this.nodes.push({ kind: 'parallel', parallel: { name, steps: wfSteps } });
    return this;
  }

  goto(target: string): this {
    this.nodes.push({ kind: 'goto', target });
    return this;
  }

  waitForApproval(): this {
    this.nodes.push({ kind: 'wait' });
    return this;
  }

  private countSteps(): number {
    let count = 0;
    for (const node of this.nodes) {
      if (node.kind === 'step') count++;
      else if (node.kind === 'parallel') count += node.parallel.steps.length;
      else if (node.kind === 'branch') {
        count += node.branch.yes.countSteps() + node.branch.no.countSteps();
      } else if (node.kind === 'goto' || node.kind === 'wait') count++;
    }
    return count;
  }

  async execute(
    ctx?: WorkflowContext,
    onStepStart?: (step: string) => void,
    onStepEnd?: (step: string, ok: boolean, dur: number) => void,
  ): Promise<WorkflowResult> {
    const context = ctx ?? new WorkflowContext();
    const started = Date.now();
    const total = this.countSteps();
    let completed = 0;

    const steps = [...this.nodes];
    const labels = new Map<string, number>();
    for (let i = 0; i < steps.length; i++) {
      const node = steps[i];
      if (node.kind === 'step') labels.set(node.step.name, i);
    }

    try {
      let i = 0;
      while (i < steps.length) {
        const node = steps[i];

        if (node.kind === 'step') {
          const stepStarted = Date.now();
          onStepStart?.(node.step.name);
          try {
            await node.step.fn(context);
            onStepEnd?.(node.step.name, true, Date.now() - stepStarted);
          } catch (e) {
            onStepEnd?.(node.step.name, false, Date.now() - stepStarted);
            throw e;
          }
          completed++;
          i++;
        } else if (node.kind === 'branch') {
          const cond = node.branch.condition(context);
          const subResult = await (cond ? node.branch.yes : node.branch.no).execute(
            context, onStepStart, onStepEnd,
          );
          completed += subResult.stepsCompleted;
          if (!subResult.success) throw new Error(subResult.error);
          i++;
        } else if (node.kind === 'parallel') {
          const stepStarted = Date.now();
          onStepStart?.(node.parallel.name);
          try {
            const results = await Promise.allSettled(
              node.parallel.steps.map(async (s) => {
                const t0 = Date.now();
                try {
                  await s.fn(context);
                  onStepEnd?.(`${node.parallel.name}/${s.name}`, true, Date.now() - t0);
                } catch (e) {
                  onStepEnd?.(`${node.parallel.name}/${s.name}`, false, Date.now() - t0);
                  throw e;
                }
              }),
            );
            const failed = results.find((r) => r.status === 'rejected');
            if (failed && failed.status === 'rejected') throw failed.reason;
            completed += node.parallel.steps.length;
          } catch (e) {
            onStepEnd?.(node.parallel.name, false, Date.now() - stepStarted);
            throw e;
          }
          i++;
        } else if (node.kind === 'goto') {
          const targetIdx = labels.get(node.target);
          if (targetIdx === undefined) throw new Error(`Unknown goto target: ${node.target}`);
          i = targetIdx;
        } else if (node.kind === 'wait') {
          const resolved = await this.resolveWait(context);
          if (!resolved) return {
            name: this.name,
            success: false,
            error: 'wait_for_approval',
            durationMs: Date.now() - started,
            stepsCompleted: completed,
            stepsTotal: total,
            context: context.getAll(),
          };
          i++;
        }
      }

      return {
        name: this.name,
        success: true,
        durationMs: Date.now() - started,
        stepsCompleted: completed,
        stepsTotal: total,
        context: context.getAll(),
      };
    } catch (e) {
      return {
        name: this.name,
        success: false,
        error: (e as Error).message,
        durationMs: Date.now() - started,
        stepsCompleted: completed,
        stepsTotal: total,
        context: context.getAll(),
      };
    }
  }

  private pendingApproval = false;
  private approvalResolve: (() => void) | null = null;

  approve(): void {
    this.pendingApproval = false;
    if (this.approvalResolve) {
      this.approvalResolve();
      this.approvalResolve = null;
    }
  }

  private async resolveWait(ctx: WorkflowContext): Promise<boolean> {
    this.pendingApproval = true;
    ctx.set('_waiting_approval', true);
    return new Promise<boolean>((resolve) => {
      this.approvalResolve = () => resolve(true);
    });
  }
}

const workflows = new Map<string, Workflow>();

export function registerWorkflow(wf: Workflow): void {
  workflows.set(wf.name, wf);
}

export function getWorkflow(name: string): Workflow | undefined {
  return workflows.get(name);
}

export function listWorkflows(): { name: string }[] {
  return [...workflows.values()].map((w) => ({
    name: w.name,
  }));
}

registerWorkflow(
  new Workflow('health-check')
    .step('check-disk', async (ctx) => {
      const cmd = new Deno.Command('df', { args: ['-h', '/'] });
      const out = await cmd.output();
      ctx.set('disk', new TextDecoder().decode(out.stdout));
    })
    .step('check-memory', async (ctx) => {
      const cmd = new Deno.Command('free', { args: ['-m'] });
      const out = await cmd.output();
      ctx.set('memory', new TextDecoder().decode(out.stdout));
    })
    .step('summarize', async (ctx) => {
      const disk = ctx.get<string>('disk') ?? 'unknown';
      const mem = ctx.get<string>('memory') ?? 'unknown';
      ctx.set('summary', `Disk:\n${disk}\nMemory:\n${mem}`);
    }),
);
