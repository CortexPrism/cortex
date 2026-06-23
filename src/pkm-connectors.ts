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

  try {
    const stat = await Deno.stat(conn.path);
    if (!stat.isDirectory) {
      conn.status = 'error';
      throw new Error(`PKM path is not a directory: ${conn.path}`);
    }
  } catch (e) {
    if ((e as Error).message.startsWith('PKM path')) throw e;
    conn.status = 'error';
    throw new Error(`PKM path not accessible: ${conn.path}`);
  }

  const extensions = conn.kind === 'notion'
    ? new Set(['.md', '.csv', '.json'])
    : new Set(['.md', '.markdown']);

  let count = 0;
  const walk = async (dir: string, depth = 0): Promise<void> => {
    if (depth > 8) return;
    try {
      for await (const entry of Deno.readDir(dir)) {
        if (entry.isDirectory && !entry.name.startsWith('.')) {
          await walk(`${dir}/${entry.name}`, depth + 1);
        } else if (entry.isFile) {
          const dot = entry.name.lastIndexOf('.');
          if (dot !== -1 && extensions.has(entry.name.slice(dot).toLowerCase())) {
            count++;
          }
        }
      }
    } catch {
      // Skip unreadable subdirectory
    }
  };

  await walk(conn.path);
  conn.fileCount = count;
  conn.lastSync = new Date().toISOString();
  conn.status = 'connected';
  return { fileCount: conn.fileCount };
}

export async function importFromPkm(
  id: string,
  format: string,
): Promise<{ imported: number; files: string[] }> {
  const conn = connections.get(id);
  if (!conn) throw new Error('Connection not found');

  const ext = format === 'json' ? '.json' : format === 'csv' ? '.csv' : '.md';
  const imported: string[] = [];

  const walk = async (dir: string, depth = 0): Promise<void> => {
    if (depth > 8) return;
    try {
      for await (const entry of Deno.readDir(dir)) {
        if (entry.isDirectory && !entry.name.startsWith('.')) {
          await walk(`${dir}/${entry.name}`, depth + 1);
        } else if (entry.isFile && entry.name.endsWith(ext)) {
          imported.push(`${dir}/${entry.name}`);
        }
      }
    } catch {
      // Skip unreadable subdirectory
    }
  };

  await walk(conn.path);
  return { imported: imported.length, files: imported.slice(0, 500) };
}

export function getImportFormats(): string[] {
  return ['markdown', 'json', 'csv', 'html'];
}
