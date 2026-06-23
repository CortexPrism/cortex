/**
 * Multi-Agent Orchestration Strategies
 *
 * Six composable primitives:
 *   sequential  — chain agents, each receives the previous output
 *   parallel    — run agents concurrently, merge outputs
 *   debate      — agents argue positions, synthesizer resolves
 *   review-loop — agent A writes, agent B reviews, iterate until approved
 *   hierarchical — coordinator delegates to worker agents
 *   graph       — user-defined DAG of nodes and edges
 */
import { spawnSubAgent } from '../sub-agent.ts';
import type { ToolContext } from '../../tools/types.ts';
import type { ProviderKind } from '../../config/config.ts';

export interface AgentSpec {
  task: string;
  agentId?: string;
  model?: string;
  provider?: ProviderKind;
  systemPrompt?: string;
  tools?: string[];
}

export interface OrchestrationResult {
  strategy: string;
  outputs: Record<string, string>;
  finalOutput: string;
  durationMs: number;
  agentCount: number;
}

async function runAgent(spec: AgentSpec, context: ToolContext): Promise<string> {
  const chunks: string[] = [];
  const iter = spawnSubAgent({
    parentSessionId: context.sessionId,
    instruction: spec.task,
    config: {
      agentId: spec.agentId,
      model: spec.model,
      provider: spec.provider,
      systemPrompt: spec.systemPrompt,
      tools: spec.tools,
      inheritedModel: context.model,
      inheritedProvider: context.provider,
    },
  });
  for await (const event of iter) {
    if (event.type === 'chunk') chunks.push(event.delta);
    if (event.type === 'done') return event.result.response || chunks.join('');
  }
  return chunks.join('');
}

// ── Sequential ───────────────────────────────────────────────────────────────
export async function runSequential(
  agents: AgentSpec[],
  context: ToolContext,
): Promise<OrchestrationResult> {
  const start = Date.now();
  const outputs: Record<string, string> = {};
  let lastOutput = '';

  for (let i = 0; i < agents.length; i++) {
    const spec = agents[i];
    const task = i === 0 ? spec.task : `${spec.task}\n\n## Previous output:\n${lastOutput}`;
    const output = await runAgent({ ...spec, task }, context);
    outputs[`agent_${i + 1}`] = output;
    lastOutput = output;
  }

  return {
    strategy: 'sequential',
    outputs,
    finalOutput: lastOutput,
    durationMs: Date.now() - start,
    agentCount: agents.length,
  };
}

// ── Parallel ─────────────────────────────────────────────────────────────────
export async function runParallel(
  agents: AgentSpec[],
  mergeInstruction: string,
  context: ToolContext,
): Promise<OrchestrationResult> {
  const start = Date.now();
  const results = await Promise.allSettled(agents.map((spec) => runAgent(spec, context)));
  const outputs: Record<string, string> = {};

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    outputs[`agent_${i + 1}`] = r.status === 'fulfilled' ? r.value : `Error: ${r.reason}`;
  }

  const mergeTask = mergeInstruction +
    '\n\n## Agent outputs to synthesize:\n' +
    Object.entries(outputs)
      .map(([k, v]) => `### ${k}:\n${v}`)
      .join('\n\n');

  const finalOutput = await runAgent({ task: mergeTask }, context);

  return {
    strategy: 'parallel',
    outputs: { ...outputs, synthesized: finalOutput },
    finalOutput,
    durationMs: Date.now() - start,
    agentCount: agents.length,
  };
}

// ── Debate ───────────────────────────────────────────────────────────────────
export async function runDebate(
  topic: string,
  positions: string[],
  rounds: number,
  context: ToolContext,
): Promise<OrchestrationResult> {
  const start = Date.now();
  const outputs: Record<string, string> = {};
  const history: string[] = [];

  const agentCount = positions.length;

  for (let round = 0; round < rounds; round++) {
    const roundOutputs = await Promise.allSettled(
      positions.map((position, i) => {
        const historyCtx = history.length > 0
          ? `\n\n## Previous round arguments:\n${history.join('\n\n')}`
          : '';
        const task =
          `Debate topic: "${topic}"\nYour position: "${position}"\nProvide a compelling argument for your position.${historyCtx}`;
        return runAgent({
          task,
          systemPrompt: `You are a skilled debater arguing for: ${position}`,
        }, context);
      }),
    );

    for (let i = 0; i < roundOutputs.length; i++) {
      const r = roundOutputs[i];
      const output = r.status === 'fulfilled' ? r.value : `Error: ${r.reason}`;
      const key = `round${round + 1}_agent${i + 1}`;
      outputs[key] = output;
      history.push(`**Agent ${i + 1} (${positions[i]}) Round ${round + 1}:**\n${output}`);
    }
  }

  const synthesisTask =
    `You are an impartial judge. Topic: "${topic}"\n\nReview these debate arguments and provide a balanced synthesis:\n\n` +
    Object.entries(outputs).map(([k, v]) => `### ${k}:\n${v}`).join('\n\n') +
    '\n\nProvide a final synthesis that identifies the strongest points from each side.';

  const finalOutput = await runAgent({ task: synthesisTask }, context);
  outputs['synthesis'] = finalOutput;

  return {
    strategy: 'debate',
    outputs,
    finalOutput,
    durationMs: Date.now() - start,
    agentCount,
  };
}

// ── Review-Loop ───────────────────────────────────────────────────────────────
export async function runReviewLoop(
  writerSpec: AgentSpec,
  reviewerSpec: AgentSpec,
  maxIterations: number,
  approvalKeyword: string,
  context: ToolContext,
): Promise<OrchestrationResult> {
  const start = Date.now();
  const outputs: Record<string, string> = {};
  let draft = '';
  let approved = false;

  for (let i = 0; i < maxIterations; i++) {
    const writerTask = i === 0
      ? writerSpec.task
      : `${writerSpec.task}\n\n## Reviewer feedback (revise accordingly):\n${
        outputs[`review_${i}`] ?? ''
      }`;

    draft = await runAgent({ ...writerSpec, task: writerTask }, context);
    outputs[`draft_${i + 1}`] = draft;

    const reviewTask =
      `${reviewerSpec.task}\n\n## Content to review:\n${draft}\n\nIf this meets all requirements, include the word "${approvalKeyword}" in your response. Otherwise provide specific feedback for improvement.`;

    const review = await runAgent({ ...reviewerSpec, task: reviewTask }, context);
    outputs[`review_${i + 1}`] = review;

    if (review.toLowerCase().includes(approvalKeyword.toLowerCase())) {
      approved = true;
      break;
    }
  }

  return {
    strategy: 'review-loop',
    outputs: {
      ...outputs,
      approved: String(approved),
      iterations: String(Object.keys(outputs).filter((k) => k.startsWith('draft_')).length),
    },
    finalOutput: draft,
    durationMs: Date.now() - start,
    agentCount: 2,
  };
}

// ── Hierarchical ─────────────────────────────────────────────────────────────
export async function runHierarchical(
  coordinatorTask: string,
  workerSpecs: AgentSpec[],
  context: ToolContext,
): Promise<OrchestrationResult> {
  const start = Date.now();
  const outputs: Record<string, string> = {};

  // Coordinator decomposes the task
  const decompositionTask =
    `${coordinatorTask}\n\nYou have ${workerSpecs.length} worker agents available.\nDecompose this into ${workerSpecs.length} specific sub-tasks, one per line, numbered 1-${workerSpecs.length}.`;

  const decomposition = await runAgent(
    {
      task: decompositionTask,
      systemPrompt: 'You are a coordinator agent that decomposes tasks and delegates to workers.',
    },
    context,
  );
  outputs['coordinator_decomposition'] = decomposition;

  // Parse sub-tasks (numbered lines)
  const lines = decomposition.split('\n').filter((l) => /^\d+\./.test(l.trim()));
  const subtasks = lines.length >= workerSpecs.length
    ? lines.slice(0, workerSpecs.length).map((l) => l.replace(/^\d+\.\s*/, '').trim())
    : workerSpecs.map((s) => s.task);

  // Workers execute in parallel
  const workerResults = await Promise.allSettled(
    workerSpecs.map((spec, i) => runAgent({ ...spec, task: subtasks[i] ?? spec.task }, context)),
  );

  for (let i = 0; i < workerResults.length; i++) {
    const r = workerResults[i];
    outputs[`worker_${i + 1}`] = r.status === 'fulfilled' ? r.value : `Error: ${r.reason}`;
  }

  // Coordinator synthesizes
  const synthTask = `${coordinatorTask}\n\nWorker results to synthesize:\n` +
    Object.entries(outputs)
      .filter(([k]) => k.startsWith('worker_'))
      .map(([k, v]) => `### ${k}:\n${v}`)
      .join('\n\n') +
    '\n\nProvide a unified, coherent final answer.';

  const finalOutput = await runAgent(
    { task: synthTask, systemPrompt: 'You are a coordinator agent synthesizing worker outputs.' },
    context,
  );
  outputs['coordinator_synthesis'] = finalOutput;

  return {
    strategy: 'hierarchical',
    outputs,
    finalOutput,
    durationMs: Date.now() - start,
    agentCount: workerSpecs.length + 1,
  };
}

// ── Graph DAG ────────────────────────────────────────────────────────────────
export interface GraphNode {
  id: string;
  task: string;
  agentId?: string;
  dependsOn?: string[];
}

export async function runGraph(
  nodes: GraphNode[],
  context: ToolContext,
): Promise<OrchestrationResult> {
  const start = Date.now();
  const outputs: Record<string, string> = {};
  const completed = new Set<string>();
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  let agentCount = 0;

  // Topological execution
  const maxPasses = nodes.length + 1;
  for (let pass = 0; pass < maxPasses && completed.size < nodes.length; pass++) {
    const ready = nodes.filter((n) => {
      if (completed.has(n.id)) return false;
      const deps = n.dependsOn ?? [];
      return deps.every((d) => completed.has(d));
    });

    if (ready.length === 0) break;

    const results = await Promise.allSettled(
      ready.map(async (node) => {
        const depContext = (node.dependsOn ?? [])
          .filter((d) => outputs[d])
          .map((d) => `### Output from "${d}":\n${outputs[d]}`)
          .join('\n\n');

        const task = depContext
          ? `${node.task}\n\n## Context from upstream nodes:\n${depContext}`
          : node.task;

        const output = await runAgent({ task, agentId: node.agentId }, context);
        return { id: node.id, output };
      }),
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        outputs[r.value.id] = r.value.output;
        completed.add(r.value.id);
        agentCount++;
      } else {
        const failedNode = ready[results.indexOf(r)];
        outputs[failedNode.id] = `Error: ${r.reason}`;
        completed.add(failedNode.id);
      }
    }
  }

  // Final output = last node with no dependents
  const leafNodes = nodes.filter((n) => !nodes.some((m) => (m.dependsOn ?? []).includes(n.id)));
  const leafOutput = leafNodes.map((n) => outputs[n.id] ?? '').join('\n\n');
  const fallback = Object.values(outputs).at(-1) ?? '';

  return {
    strategy: 'graph',
    outputs,
    finalOutput: leafOutput || fallback,
    durationMs: Date.now() - start,
    agentCount,
  };
}
