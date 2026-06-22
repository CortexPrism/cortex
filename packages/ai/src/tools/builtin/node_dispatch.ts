import type { Tool, ToolCallResult, ToolContext } from '../types.ts';
import { type getNode, listNodes, type NodeRecord } from '../../../../../src/hub/node-registry.ts';
import { dispatchAndWait, getConnectedNodes, type getNodeConnectionCount } from '../../../../../src/hub/ws-node.ts';

function directiveId(): string {
  return `dir_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function selectNode(
  connected: string[],
  records: NodeRecord[],
  filters: { nodeId?: string; tier?: string; group?: string; capability?: string },
): NodeRecord | null {
  if (filters.nodeId) {
    const match = records.find((n) => n.id === filters.nodeId);
    if (match && connected.includes(match.id)) return match;
    return null;
  }

  let candidates = records.filter((n) => connected.includes(n.id) && n.status === 'connected');

  if (filters.tier) {
    candidates = candidates.filter((n) => n.tier === filters.tier);
  }
  if (filters.group) {
    candidates = candidates.filter((n) => n.group_name === filters.group);
  }
  if (filters.capability) {
    candidates = candidates.filter((n) => n.capabilities.includes(filters.capability!));
  }

  if (candidates.length === 0) return null;
  return candidates[0];
}

function formatNodeList(records: NodeRecord[], connected: string[]): string {
  if (records.length === 0) return 'No nodes registered.';

  const lines = records.map((n) => {
    const isConnected = connected.includes(n.id);
    const status = isConnected ? 'connected' : n.status;
    const caps = n.capabilities.length > 0 ? n.capabilities.join(', ') : 'none';
    return [
      `- ${n.name} (${n.id})`,
      `  Status: ${status}`,
      `  Tier: ${n.tier}`,
      `  Group: ${n.group_name ?? 'none'}`,
      `  Endpoint: ${n.endpoint}`,
      `  Capabilities: ${caps}`,
      `  Version: ${n.version ?? 'unknown'}`,
      `  Last heartbeat: ${n.last_heartbeat ?? 'never'}`,
    ].join('\n');
  });

  const connectedCount = records.filter((n) => connected.includes(n.id)).length;
  return `${records.length} node(s) registered, ${connectedCount} connected:\n\n${
    lines.join('\n\n')
  }`;
}

export const nodeDispatchTool: Tool = {
  definition: {
    name: 'node_dispatch',
    description:
      `Delegate work to a distributed Cortex Node for remote execution. Nodes are machines running the Cortex Node agent that connect back to this hub. Use this tool to run shell commands, read/write files, or execute code on remote machines.

## When to Use
- **Remote execution**: Run a shell command on a specific remote machine
- **Cross-machine file operations**: Read or write files on remote nodes
- **Distributed work**: Execute tasks on nodes in different locations
- **Node discovery**: List available nodes and their capabilities

## Parameters

Use either:
- \`node_id\` to target a specific node, OR
- \`tier\` / \`group\` / \`capability\` to filter and auto-select a node
- \`action\` — set to "list" to discover available nodes (no dispatch needed)
- \`action\` — set to the tool name (e.g., "shell", "file_read", "file_write", "code_exec") to execute remotely
- \`params\` — the arguments for the action tool
- \`timeout_ms\` — optional timeout (default 120000ms)`,
    params: [
      {
        name: 'action',
        type: 'string',
        description:
          'The action to perform. Use "list" to discover available nodes. Use a tool name (shell, file_read, file_write, code_exec, web_search) to execute remotely.',
        required: true,
      },
      {
        name: 'params',
        type: 'object',
        description:
          'Parameters for the action. For "list", leave empty. For tool actions, pass the tool arguments (e.g., {"command": "ls -la"} for shell).',
        required: false,
      },
      {
        name: 'node_id',
        type: 'string',
        description:
          'Target a specific node by its ID. If omitted, filters (tier/group/capability) are used.',
        required: false,
      },
      {
        name: 'tier',
        type: 'string',
        description: 'Filter nodes by capability tier: "root", "sudo", or "unprivileged"',
        required: false,
        enum: ['root', 'sudo', 'unprivileged'],
      },
      {
        name: 'group',
        type: 'string',
        description: 'Filter nodes by group name',
        required: false,
      },
      {
        name: 'capability',
        type: 'string',
        description: 'Filter nodes by required capability (e.g., "shell", "code_exec")',
        required: false,
      },
      {
        name: 'timeout_ms',
        type: 'number',
        description: 'Timeout in milliseconds for the remote execution (default 120000)',
        required: false,
      },
    ],
    capabilities: ['shell:run', 'network:fetch'],
  },

  async execute(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolCallResult> {
    const startTime = Date.now();
    const action = String(args.action ?? '').trim();

    if (!action) {
      return {
        toolName: 'node_dispatch',
        success: false,
        output: '',
        error: 'The "action" parameter is required.',
        durationMs: 0,
      };
    }

    const records = await listNodes();
    const connected = getConnectedNodes();

    if (action === 'list') {
      return {
        toolName: 'node_dispatch',
        success: true,
        output: formatNodeList(records, connected),
        durationMs: Date.now() - startTime,
      };
    }

    if (connected.length === 0) {
      return {
        toolName: 'node_dispatch',
        success: false,
        output: '',
        error: 'No nodes are currently connected. Use action="list" to see registered nodes.',
        durationMs: Date.now() - startTime,
      };
    }

    const filters = {
      nodeId: args.node_id as string | undefined,
      tier: args.tier as string | undefined,
      group: args.group as string | undefined,
      capability: args.capability as string | undefined,
    };

    const selected = selectNode(connected, records, filters);

    if (!selected) {
      const filterDesc = filters.nodeId ? `node ID "${filters.nodeId}"` : Object.entries(filters)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      return {
        toolName: 'node_dispatch',
        success: false,
        output: '',
        error: `No connected node matching ${
          filterDesc || 'no filters'
        }. Use action="list" to see available nodes.`,
        durationMs: Date.now() - startTime,
      };
    }

    const toolCallParams = args.params as Record<string, unknown> | undefined;

    const directivePayload = `<tool_call>{"tool":"${action}","args":${
      JSON.stringify(toolCallParams ?? {})
    }}</tool_call>`;

    const id = directiveId();
    const timeoutMs = (args.timeout_ms as number) ?? 120_000;

    try {
      const result = await dispatchAndWait(
        selected.id,
        {
          id,
          sessionId: context.sessionId,
          action,
          params: { _directive_payload: directivePayload },
          timeoutMs,
        },
        timeoutMs,
      );

      return {
        toolName: 'node_dispatch',
        success: result.success,
        output: result.success ? result.output : '',
        error: result.error,
        durationMs: result.durationMs,
      };
    } catch (e) {
      return {
        toolName: 'node_dispatch',
        success: false,
        output: '',
        error: `Node dispatch failed: ${(e as Error).message}`,
        durationMs: Date.now() - startTime,
      };
    }
  },
};

export default nodeDispatchTool;
