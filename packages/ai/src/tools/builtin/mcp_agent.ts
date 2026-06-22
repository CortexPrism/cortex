import type { Tool, ToolCallResult, ToolContext } from '../types.ts';
import {
  callHttpTool,
  callStdioTool,
  getConnection,
  listConnections,
  type McpToolDef,
} from '../../../../../src/mcp/client.ts';

function formatToolList(tools: McpToolDef[]): string {
  if (!tools.length) return '  (no tools)';
  return tools
    .map(
      (t) =>
        `  - ${t.name}: ${t.description}${
          t.inputSchema && Object.keys(t.inputSchema).length > 0
            ? ' (params: ' + JSON.stringify(t.inputSchema) + ')'
            : ''
        }`,
    )
    .join('\n');
}

export const mcpAgentTool: Tool = {
  definition: {
    name: 'mcp_agent',
    description:
      `Call an external coding agent connected via MCP (Model Context Protocol). Use this to delegate tasks to agents like Kilocode, Claude, Codex, or any MCP-compatible tool.

## Actions
- **list** — List all connected MCP servers and their available tools
- **call** — Call a specific tool on a connected MCP server
- **describe** — Get detailed information about a connected server and its tools

## When to Use
- Delegating specialized coding tasks to external agents
- Using tools exposed by other MCP-compatible agents
- Parallel work: call multiple MCP agents in the same turn

## Connected Servers
Use the "list" action to see what agents are currently connected and what tools they expose.`,
    params: [
      {
        name: 'action',
        type: 'string',
        description: 'Action: "list", "call", or "describe"',
        required: true,
        enum: ['list', 'call', 'describe'],
      },
      {
        name: 'server',
        type: 'string',
        description: 'MCP server name (required for "call" and "describe")',
        required: false,
      },
      {
        name: 'tool',
        type: 'string',
        description: 'Tool name to call on the server (required for "call")',
        required: false,
      },
      {
        name: 'args',
        type: 'object',
        description: 'Arguments to pass to the tool (JSON object)',
        required: false,
      },
    ],
    capabilities: ['shell:run', 'network:fetch'],
  },

  async execute(
    args: Record<string, unknown>,
    _context: ToolContext,
  ): Promise<ToolCallResult> {
    const action = String(args.action ?? 'list').trim().toLowerCase();
    const startTime = Date.now();

    try {
      switch (action) {
        case 'list': {
          const connections = listConnections();
          if (!connections.length) {
            return {
              toolName: 'mcp_agent',
              success: true,
              output:
                'No MCP servers are currently connected. Use `cortex mcp connect` to connect to external agents.',
              durationMs: Date.now() - startTime,
            };
          }

          const lines: string[] = [];
          for (const conn of connections) {
            const status = conn.connected ? 'connected' : 'disconnected';
            const info = conn.serverInfo
              ? `${conn.serverInfo.name} v${conn.serverInfo.version}`
              : 'unknown';
            lines.push(
              `**${conn.config.name}** (${conn.config.transport}, ${status}) — ${info}`,
            );
            lines.push(`  Calls: ${conn.calls}, Errors: ${conn.errors}`);
            lines.push('  Tools:');
            lines.push(formatToolList(conn.tools));
            lines.push('');
          }

          return {
            toolName: 'mcp_agent',
            success: true,
            output: lines.join('\n'),
            durationMs: Date.now() - startTime,
          };
        }

        case 'describe': {
          const server = String(args.server ?? '').trim();
          if (!server) {
            return {
              toolName: 'mcp_agent',
              success: false,
              output: '',
              error: 'The "server" parameter is required for the "describe" action.',
              durationMs: Date.now() - startTime,
            };
          }

          const conn = getConnection(server);
          if (!conn) {
            return {
              toolName: 'mcp_agent',
              success: false,
              output: '',
              error: `No MCP server "${server}" is connected. Use "list" to see connected servers.`,
              durationMs: Date.now() - startTime,
            };
          }

          const info = conn.serverInfo
            ? `${conn.serverInfo.name} v${conn.serverInfo.version}`
            : 'unknown';
          const lines = [
            `**${conn.config.name}** — ${conn.config.transport}, ${
              conn.connected ? 'connected' : 'disconnected'
            }`,
            `Server: ${info}`,
            `Calls: ${conn.calls}, Errors: ${conn.errors}`,
            `Connected since: ${conn.createdAt.toISOString()}`,
            `Tools (${conn.tools.length}):`,
            formatToolList(conn.tools),
          ];

          return {
            toolName: 'mcp_agent',
            success: true,
            output: lines.join('\n'),
            durationMs: Date.now() - startTime,
          };
        }

        case 'call': {
          const server = String(args.server ?? '').trim();
          const tool = String(args.tool ?? '').trim();

          if (!server) {
            return {
              toolName: 'mcp_agent',
              success: false,
              output: '',
              error: 'The "server" parameter is required for the "call" action.',
              durationMs: Date.now() - startTime,
            };
          }

          if (!tool) {
            return {
              toolName: 'mcp_agent',
              success: false,
              output: '',
              error: 'The "tool" parameter is required for the "call" action.',
              durationMs: Date.now() - startTime,
            };
          }

          const conn = getConnection(server);
          if (!conn) {
            return {
              toolName: 'mcp_agent',
              success: false,
              output: '',
              error: `No MCP server "${server}" is connected. Use "list" to see connected servers.`,
              durationMs: Date.now() - startTime,
            };
          }

          const toolArgs = (args.args as Record<string, unknown>) ?? {};

          const result = conn.config.transport === 'http'
            ? await callHttpTool(server, tool, toolArgs)
            : await callStdioTool(server, tool, toolArgs);

          const textContent = result.content
            .filter((c) => c.type === 'text' && c.text)
            .map((c) => c.text!)
            .join('\n');

          const nonTextContent = result.content
            .filter((c) => c.type !== 'text')
            .map((c) => `[${c.type}]`)
            .join(', ');

          return {
            toolName: 'mcp_agent',
            success: true,
            output: textContent + (nonTextContent ? `\n(Non-text content: ${nonTextContent})` : ''),
            durationMs: Date.now() - startTime,
          };
        }

        default:
          return {
            toolName: 'mcp_agent',
            success: false,
            output: '',
            error: `Unknown action: "${action}". Use "list", "call", or "describe".`,
            durationMs: Date.now() - startTime,
          };
      }
    } catch (e) {
      return {
        toolName: 'mcp_agent',
        success: false,
        output: '',
        error: `MCP agent error: ${(e as Error).message}`,
        durationMs: Date.now() - startTime,
      };
    }
  },
};
