/**
 * orchestrate — Multi-Agent Orchestration Tool
 *
 * Exposes all 6 strategies from src/agent/orchestration/strategies.ts
 * as a single tool callable by the agent.
 */
import type { Tool, ToolCallResult, ToolContext } from '../types.ts';
import type { AgentSpec, GraphNode } from '../../agent/orchestration/strategies.ts';

export const orchestrateTool: Tool = {
  definition: {
    name: 'orchestrate',
    description:
      'Orchestrate multiple sub-agents using one of 6 strategies: sequential (chain), parallel (concurrent merge), debate (adversarial synthesis), review-loop (write+critique iteration), hierarchical (coordinator+workers), or graph (user-defined DAG). Returns a unified final output plus per-agent outputs.',
    capabilities: ['shell:run'],
    params: [
      {
        name: 'strategy',
        type: 'string',
        description: 'Orchestration strategy to use',
        required: true,
        enum: ['sequential', 'parallel', 'debate', 'review-loop', 'hierarchical', 'graph'],
      },
      {
        name: 'agents',
        type: 'array',
        description:
          'For sequential/parallel/hierarchical: array of agent specs {task, agentId?, model?, provider?, systemPrompt?, tools?[]}',
        required: false,
      },
      {
        name: 'topic',
        type: 'string',
        description: 'For debate: the topic being debated',
        required: false,
      },
      {
        name: 'positions',
        type: 'array',
        description: 'For debate: array of position strings, one per debater agent',
        required: false,
      },
      {
        name: 'rounds',
        type: 'number',
        description: 'For debate: number of debate rounds (default 2)',
        required: false,
      },
      {
        name: 'writer',
        type: 'object',
        description: 'For review-loop: writer agent spec {task, agentId?, model?}',
        required: false,
      },
      {
        name: 'reviewer',
        type: 'object',
        description: 'For review-loop: reviewer agent spec {task, agentId?, model?}',
        required: false,
      },
      {
        name: 'max_iterations',
        type: 'number',
        description: 'For review-loop: maximum write-review cycles (default 3)',
        required: false,
      },
      {
        name: 'approval_keyword',
        type: 'string',
        description: 'For review-loop: word the reviewer must say to approve (default: "APPROVED")',
        required: false,
      },
      {
        name: 'coordinator_task',
        type: 'string',
        description: 'For hierarchical: task for the coordinator agent',
        required: false,
      },
      {
        name: 'nodes',
        type: 'array',
        description:
          'For graph: array of {id, task, agentId?, dependsOn?[]} nodes defining the DAG',
        required: false,
      },
      {
        name: 'merge_instruction',
        type: 'string',
        description:
          'For parallel: instruction for the synthesizer agent that merges all outputs (default: "Synthesize the following outputs into a unified response.")',
        required: false,
      },
    ],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();
    const strategy = String(args.strategy ?? '').trim();

    try {
      const {
        runSequential,
        runParallel,
        runDebate,
        runReviewLoop,
        runHierarchical,
        runGraph,
      } = await import('../../agent/orchestration/strategies.ts');

      let result;

      switch (strategy) {
        case 'sequential': {
          const agents = parseAgents(args.agents);
          if (agents.length < 2) {
            return errResult('sequential requires at least 2 agents', start);
          }
          result = await runSequential(agents, context);
          break;
        }

        case 'parallel': {
          const agents = parseAgents(args.agents);
          if (agents.length < 2) {
            return errResult('parallel requires at least 2 agents', start);
          }
          const mergeInstruction = String(
            args.merge_instruction ?? 'Synthesize the following outputs into a unified response.',
          );
          result = await runParallel(agents, mergeInstruction, context);
          break;
        }

        case 'debate': {
          const topic = String(args.topic ?? '').trim();
          const positions = Array.isArray(args.positions)
            ? (args.positions as string[])
            : ['For', 'Against'];
          const rounds = Math.max(1, Math.min(5, Number(args.rounds ?? 2)));
          if (!topic) return errResult('debate requires a topic', start);
          if (positions.length < 2) return errResult('debate requires at least 2 positions', start);
          result = await runDebate(topic, positions, rounds, context);
          break;
        }

        case 'review-loop': {
          const writer = parseAgentSpec(args.writer);
          const reviewer = parseAgentSpec(args.reviewer);
          if (!writer?.task) return errResult('review-loop requires writer.task', start);
          if (!reviewer?.task) return errResult('review-loop requires reviewer.task', start);
          const maxIter = Math.max(1, Math.min(10, Number(args.max_iterations ?? 3)));
          const approvalKeyword = String(args.approval_keyword ?? 'APPROVED');
          result = await runReviewLoop(writer, reviewer, maxIter, approvalKeyword, context);
          break;
        }

        case 'hierarchical': {
          const coordinatorTask = String(args.coordinator_task ?? '').trim();
          const workers = parseAgents(args.agents);
          if (!coordinatorTask) return errResult('hierarchical requires coordinator_task', start);
          if (workers.length < 1) {
            return errResult('hierarchical requires at least 1 worker agent', start);
          }
          result = await runHierarchical(coordinatorTask, workers, context);
          break;
        }

        case 'graph': {
          const nodes = parseNodes(args.nodes);
          if (nodes.length < 1) return errResult('graph requires at least 1 node', start);
          result = await runGraph(nodes, context);
          break;
        }

        default:
          return errResult(
            `Unknown strategy "${strategy}". Valid: sequential, parallel, debate, review-loop, hierarchical, graph`,
            start,
          );
      }

      const summary = [
        `## Orchestration complete`,
        `Strategy: ${result.strategy} | Agents: ${result.agentCount} | Duration: ${result.durationMs}ms`,
        '',
        '## Final output',
        result.finalOutput,
        '',
        `## Per-agent outputs (${Object.keys(result.outputs).length} total)`,
        ...Object.entries(result.outputs).map(([k, v]) =>
          `### ${k}\n${v.slice(0, 500)}${v.length > 500 ? '\n…(truncated)' : ''}`
        ),
      ].join('\n');

      return {
        toolName: 'orchestrate',
        success: true,
        output: summary,
        durationMs: Date.now() - start,
      };
    } catch (e) {
      return {
        toolName: 'orchestrate',
        success: false,
        output: '',
        error: `Orchestration failed: ${(e as Error).message}`,
        durationMs: Date.now() - start,
      };
    }
  },
};

function parseAgents(raw: unknown): AgentSpec[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (typeof item === 'string') return { task: item };
    const obj = item as Record<string, unknown>;
    return {
      task: String(obj.task ?? ''),
      agentId: obj.agentId ? String(obj.agentId) : undefined,
      model: obj.model ? String(obj.model) : undefined,
      systemPrompt: obj.systemPrompt ? String(obj.systemPrompt) : undefined,
      tools: Array.isArray(obj.tools) ? (obj.tools as string[]) : undefined,
    };
  }).filter((a) => a.task);
}

function parseAgentSpec(raw: unknown): AgentSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (!obj.task) return null;
  return {
    task: String(obj.task),
    agentId: obj.agentId ? String(obj.agentId) : undefined,
    model: obj.model ? String(obj.model) : undefined,
    systemPrompt: obj.systemPrompt ? String(obj.systemPrompt) : undefined,
    tools: Array.isArray(obj.tools) ? (obj.tools as string[]) : undefined,
  };
}

function parseNodes(raw: unknown): GraphNode[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const obj = item as Record<string, unknown>;
    return {
      id: String(obj.id ?? ''),
      task: String(obj.task ?? ''),
      agentId: obj.agentId ? String(obj.agentId) : undefined,
      dependsOn: Array.isArray(obj.dependsOn) ? (obj.dependsOn as string[]) : undefined,
    };
  }).filter((n) => n.id && n.task);
}

function errResult(msg: string, start: number): ToolCallResult {
  return {
    toolName: 'orchestrate',
    success: false,
    output: '',
    error: msg,
    durationMs: Date.now() - start,
  };
}

export default orchestrateTool;
