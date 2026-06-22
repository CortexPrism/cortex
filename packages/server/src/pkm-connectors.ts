export interface PkmConnection {
  id: string;
  kind: 'obsidian' | 'logseq' | 'notion' | 'roam';
  path: string;
  name: string;
  status: 'connected' | 'error' | 'disconnected';
  fileCount: number;
  lastSync: string | null;
}

const connections = new Map<string, PkmConnection>();

export function connectPkm(kind: PkmConnection['kind'], path: string, name: string): PkmConnection {
  const id = `pkm_${Date.now().toString(36)}`;
  const conn: PkmConnection = {
    id,
    kind,
    path,
    name,
    status: 'connected',
    fileCount: 0,
    lastSync: null,
  };
  connections.set(id, conn);
  return conn;
}

export function disconnectPkm(id: string): boolean {
  return connections.delete(id);
}

export function listPkmConnections(): PkmConnection[] {
  return Array.from(connections.values());
}

export async function syncPkm(id: string): Promise<{ fileCount: number }> {
  const conn = connections.get(id);
  if (!conn) throw new Error('Connection not found');
  await new Promise((r) => setTimeout(r, 100));
  conn.fileCount = Math.floor(Math.random() * 50) + 5;
  conn.lastSync = new Date().toISOString();
  conn.status = 'connected';
  return { fileCount: conn.fileCount };
}

export function getImportFormats(): string[] {
  return ['markdown', 'json', 'csv', 'html'];
}
