import type { Tool, ToolCallResult, ToolCapability, ToolParam } from './types.ts';
import type { McpToolDef } from '../mcp/client.ts';
import { callHttpTool, callStdioTool, getConnection } from '../mcp/client.ts';

function mcpSchemaToParams(schema: Record<string, unknown>): ToolParam[] {
  const params: ToolParam[] = [];
  const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required: string[] = Array.isArray(schema.required) ? (schema.required as string[]) : [];

  for (const [name, prop] of Object.entries(properties)) {
    const type = (prop.type as string) ?? 'string';
    const mappedType = mapJsonSchemaType(type);
    const param: ToolParam = {
      name,
      type: mappedType,
      description: (prop.description as string) ?? '',
      required: required.includes(name),
    };
    if (
      prop.enum && Array.isArray(prop.enum) &&
      prop.enum.every((v: unknown) => typeof v === 'string')
    ) {
      param.enum = prop.enum as string[];
    }
    params.push(param);
  }

  return params;
}

function mapJsonSchemaType(jsonType: string): ToolParam['type'] {
  switch (jsonType) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'object':
      return 'object';
    case 'array':
      return 'array';
    default:
      return 'string';
  }
}

const CAPABILITY_KEYWORDS: Array<{ pattern: RegExp; capability: ToolCapability }> = [
  { pattern: /screenshot/i, capability: 'computer:screenshot' },
  { pattern: /network|fetch|request|http/i, capability: 'network:fetch' },
  { pattern: /navigate|url|navigation/i, capability: 'network:fetch' },
  { pattern: /mouse|click|hover|drag|scroll/i, capability: 'computer:mouse' },
  { pattern: /keyboard|type|key|press/i, capability: 'computer:keyboard' },
  { pattern: /file.*(read|open|load|upload)/i, capability: 'fs:read' },
  { pattern: /file.*(write|save|download)/i, capability: 'fs:write' },
  { pattern: /shell|exec|command|process/i, capability: 'shell:run' },
  { pattern: /control|clipboard/i, capability: 'computer:control' },
];

export function inferCapabilitiesFromMcpTool(toolDef: McpToolDef): ToolCapability[] {
  const capabilities = new Set<ToolCapability>();
  const searchText = `${toolDef.name} ${toolDef.description}`;

  for (const { pattern, capability } of CAPABILITY_KEYWORDS) {
    if (pattern.test(searchText)) {
      capabilities.add(capability);
    }
  }

  return [...capabilities];
}

export function createMcpToolWrapper(
  connectionName: string,
  toolDef: McpToolDef,
  capabilities?: ToolCapability[],
): Tool {
  const name = toolDef.name;
  const description = toolDef.description;
  const params = mcpSchemaToParams(toolDef.inputSchema as Record<string, unknown>);
  const inferredCapabilities = capabilities ?? inferCapabilitiesFromMcpTool(toolDef);

  return {
    definition: {
      name,
      description,
      params,
      capabilities: inferredCapabilities,
    },
    execute: async (
      args: Record<string, unknown>,
      _context: {
        sessionId: string;
        workingDir: string;
        agentId: string;
        workspaceDir: string;
        approvalGate?: (tool: string, command: string, sampleData?: string) => Promise<boolean>;
      },
    ): Promise<ToolCallResult> => {
      const start = Date.now();
      try {
        const conn = getConnection(connectionName);
        if (!conn) {
          return {
            toolName: name,
            success: false,
            output: '',
            error: `MCP connection "${connectionName}" not found`,
            durationMs: Date.now() - start,
          };
        }

        let result: { content: Array<{ type: string; text?: string }> };

        if (conn.config.transport === 'stdio') {
          result = await callStdioTool(connectionName, name, args);
        } else if (conn.config.transport === 'http') {
          result = await callHttpTool(connectionName, name, args);
        } else {
          return {
            toolName: name,
            success: false,
            output: '',
            error: `Unsupported transport: ${conn.config.transport}`,
            durationMs: Date.now() - start,
          };
        }

        const textContent = result.content
          .filter((c) => c.type === 'text' && c.text)
          .map((c) => c.text!)
          .join('\n');

        const nonTextContent = result.content.filter((c) => c.type !== 'text');

        let output = textContent;
        if (nonTextContent.length > 0) {
          output += '\n' + JSON.stringify(nonTextContent, null, 2);
        }

        return {
          toolName: name,
          success: true,
          output: output || '(empty response)',
          durationMs: Date.now() - start,
        };
      } catch (err) {
        return {
          toolName: name,
          success: false,
          output: '',
          error: (err as Error).message,
          durationMs: Date.now() - start,
        };
      }
    },
  };
}
