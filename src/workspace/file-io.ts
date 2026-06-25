import type { AgentWorkspace, DirEntry, FileStat } from './agent-workspace.ts';

export interface WorkspaceIO {
  readFile(hostPath: string): Promise<string>;
  writeFile(hostPath: string, content: string): Promise<void>;
  readFileRaw(hostPath: string): Promise<Uint8Array>;
  stat(hostPath: string): Promise<FileStat>;
  readDir(hostPath: string): Promise<DirEntry[]>;
  mkdir(hostPath: string, recursive?: boolean): Promise<void>;
  remove(hostPath: string, recursive?: boolean): Promise<void>;
}

/** Create a workspace I/O dispatcher. When ws is available, routes through it. */
export function createWorkspaceIO(ws: AgentWorkspace | undefined): WorkspaceIO {
  return {
    async readFile(hostPath: string): Promise<string> {
      if (ws) return await ws.readFile(hostPath);
      return await Deno.readTextFile(hostPath);
    },
    async writeFile(hostPath: string, content: string): Promise<void> {
      if (ws) return await ws.writeFile(hostPath, content);
      const dir = hostPath.split('/').slice(0, -1).join('/');
      if (dir) await Deno.mkdir(dir, { recursive: true }).catch(() => {});
      await Deno.writeTextFile(hostPath, content);
    },
    async readFileRaw(hostPath: string): Promise<Uint8Array> {
      if (ws) return await ws.readFileRaw(hostPath);
      return await Deno.readFile(hostPath);
    },
    async stat(hostPath: string): Promise<FileStat> {
      if (ws) return await ws.stat(hostPath);
      const s = await Deno.stat(hostPath);
      return { isFile: s.isFile, isDirectory: s.isDirectory, size: s.size, mtime: s.mtime ?? null };
    },
    async readDir(hostPath: string): Promise<DirEntry[]> {
      if (ws) return await ws.readDir(hostPath);
      const entries: DirEntry[] = [];
      for await (const e of Deno.readDir(hostPath)) {
        entries.push({ name: e.name, isFile: e.isFile, isDirectory: e.isDirectory });
      }
      return entries;
    },
    async mkdir(hostPath: string, recursive = false): Promise<void> {
      if (ws) return await ws.mkdir(hostPath, recursive);
      await Deno.mkdir(hostPath, { recursive });
    },
    async remove(hostPath: string, recursive = false): Promise<void> {
      if (ws) return await ws.remove(hostPath, recursive);
      await Deno.remove(hostPath, { recursive });
    },
  };
}
