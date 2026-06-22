import { listNodes, type NodeRecord } from '../../../../src/hub/node-registry.ts';
import { getConnectedNodes } from '../../../../src/hub/ws-node.ts';

export async function buildNodeContextSection(): Promise<string | null> {
  const records = await listNodes();
  if (records.length === 0) return null;

  const connected = getConnectedNodes();
  const connectedNodes = records.filter((n: NodeRecord) =>
    connected.includes(n.id) && n.status === 'connected'
  );

  if (connectedNodes.length === 0) {
    const registeredNames = records.map((n: NodeRecord) => `${n.name} (${n.id}) [${n.tier}]`).join(
      ', ',
    );
    return `## Distributed Nodes

${records.length} node(s) registered but none are currently connected: ${registeredNames}

Use \`node_dispatch\` with \`action="list"\` to check node status at any time.`;
  }

  const lines = connectedNodes.map((n: NodeRecord) => {
    const caps = n.capabilities.length > 0 ? n.capabilities.join(', ') : 'all (unrestricted)';
    return `- **${n.name}** (ID: \`${n.id}\`)
  - Tier: \`${n.tier}\` | Group: ${n.group_name ?? 'none'}
  - Capabilities: ${caps}
  - Version: ${n.version ?? 'unknown'}`;
  });

  const offlineCount = records.length - connectedNodes.length;
  const offlineNote = offlineCount > 0
    ? `\n${offlineCount} additional node(s) are registered but offline.`
    : '';

  return `## Distributed Nodes

You have access to ${connectedNodes.length} connected distributed node(s):${offlineNote}

${lines.join('\n\n')}

### How to Use
Call the \`node_dispatch\` tool to delegate work to a remote node:
- \`action="list"\` — discover available nodes
- \`action="shell"\`, \`params={"command":"..."}\` — run shell commands on a node
- \`action="file_read"\`, \`params={"path":"..."}\` — read a file on a node
- \`action="file_write"\`, \`params={"path":"...", "content":"..."}\` — write a file on a node
- \`action="code_exec"\`, \`params={"code":"..."}\` — execute code on a node

Target a specific node with \`node_id\`, or filter by \`tier\`, \`group\`, or \`capability\`.`;
}

export function injectNodeContext(prompt: string, nodeSection: string | null): string {
  if (!nodeSection) return prompt;
  return `${prompt}\n\n${nodeSection}`;
}
