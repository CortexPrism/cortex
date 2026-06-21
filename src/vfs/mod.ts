/**
 * Virtual Filesystem — OS-level namespace abstraction for CortexPrism.
 *
 * Maps virtual `/cortex/...` paths to real filesystem locations and
 * database tables, giving agents a consistent namespace regardless of
 * where data is physically stored.
 */
import { join } from '@std/path';
import { PATHS } from '../config/paths.ts';

// ── Types ────────────────────────────────────────────────────

/** Top-level namespaces in the virtual filesystem. */
export type VfsNamespace =
  | 'agents'
  | 'memory'
  | 'config'
  | 'db'
  | 'logs'
  | 'workspace'
  | 'plugins';

/** A resolved virtual path result. */
export interface VfsResolveResult {
  /** The real filesystem path (for file-backed resources). */
  realPath?: string;
  /** Whether this path is backed by a database table. */
  dbBacked: boolean;
  /** Database table reference (when dbBacked). */
  dbTable?: string;
  /** The namespace this path belongs to. */
  namespace: VfsNamespace;
  /** The original virtual path. */
  virtualPath: string;
}

// ── Path Matchers ────────────────────────────────────────────

interface VfsMatcher {
  pattern: RegExp;
  resolve: (match: RegExpMatchArray) => VfsResolveResult;
}

const MATCHERS: VfsMatcher[] = [
  // /cortex/agents/:id/soul.md
  {
    pattern: /^\/cortex\/agents\/([^/]+)\/soul\.md$/,
    resolve: (m) => ({
      realPath: join(PATHS.configDir, 'agents', m[1], 'SOUL.md'),
      dbBacked: false,
      namespace: 'agents',
      virtualPath: m[0],
    }),
  },
  // /cortex/agents/:id/user.md
  {
    pattern: /^\/cortex\/agents\/([^/]+)\/user\.md$/,
    resolve: (m) => ({
      realPath: join(PATHS.configDir, 'agents', m[1], 'USER.md'),
      dbBacked: false,
      namespace: 'agents',
      virtualPath: m[0],
    }),
  },
  // /cortex/agents/:id/memory.md
  {
    pattern: /^\/cortex\/agents\/([^/]+)\/memory\.md$/,
    resolve: (m) => ({
      realPath: join(PATHS.configDir, 'agents', m[1], 'MEMORY.md'),
      dbBacked: false,
      namespace: 'agents',
      virtualPath: m[0],
    }),
  },
  // /cortex/agents/:id/workspace
  {
    pattern: /^\/cortex\/agents\/([^/]+)\/workspace\/?$/,
    resolve: (m) => ({
      realPath: join(PATHS.workspacesDir, m[1]),
      dbBacked: false,
      namespace: 'agents',
      virtualPath: m[0],
    }),
  },
  // /cortex/agents/:id — root for an agent
  {
    pattern: /^\/cortex\/agents\/([^/]+)\/?$/,
    resolve: (m) => ({
      realPath: join(PATHS.configDir, 'agents', m[1]),
      dbBacked: false,
      namespace: 'agents',
      virtualPath: m[0],
    }),
  },

  // /cortex/memory/episodic
  {
    pattern: /^\/cortex\/memory\/episodic\/?$/,
    resolve: () => ({
      realPath: PATHS.memoryDb,
      dbBacked: true,
      dbTable: 'episodic_memory',
      namespace: 'memory',
      virtualPath: '/cortex/memory/episodic',
    }),
  },
  // /cortex/memory/semantic
  {
    pattern: /^\/cortex\/memory\/semantic\/?$/,
    resolve: () => ({
      realPath: PATHS.memoryDb,
      dbBacked: true,
      dbTable: 'semantic_memory',
      namespace: 'memory',
      virtualPath: '/cortex/memory/semantic',
    }),
  },
  // /cortex/memory/procedural
  {
    pattern: /^\/cortex\/memory\/procedural\/?$/,
    resolve: () => ({
      realPath: PATHS.memoryDb,
      dbBacked: true,
      dbTable: 'procedural_memory',
      namespace: 'memory',
      virtualPath: '/cortex/memory/procedural',
    }),
  },
  // /cortex/memory/graph
  {
    pattern: /^\/cortex\/memory\/graph\/?$/,
    resolve: () => ({
      realPath: PATHS.memoryDb,
      dbBacked: true,
      dbTable: 'knowledge_graph',
      namespace: 'memory',
      virtualPath: '/cortex/memory/graph',
    }),
  },
  // /cortex/memory — root listing
  {
    pattern: /^\/cortex\/memory\/?$/,
    resolve: () => ({
      realPath: PATHS.memoryDb,
      dbBacked: true,
      namespace: 'memory',
      virtualPath: '/cortex/memory',
    }),
  },

  // /cortex/config/soul.md
  {
    pattern: /^\/cortex\/config\/soul\.md$/,
    resolve: () => ({
      realPath: PATHS.soulFile,
      dbBacked: false,
      namespace: 'config',
      virtualPath: '/cortex/config/soul.md',
    }),
  },
  // /cortex/config/user.md
  {
    pattern: /^\/cortex\/config\/user\.md$/,
    resolve: () => ({
      realPath: PATHS.userFile,
      dbBacked: false,
      namespace: 'config',
      virtualPath: '/cortex/config/user.md',
    }),
  },
  // /cortex/config/memory.md
  {
    pattern: /^\/cortex\/config\/memory\.md$/,
    resolve: () => ({
      realPath: PATHS.memoryFile,
      dbBacked: false,
      namespace: 'config',
      virtualPath: '/cortex/config/memory.md',
    }),
  },
  // /cortex/config/config.json
  {
    pattern: /^\/cortex\/config\/config\.json$/,
    resolve: () => ({
      realPath: PATHS.configFile,
      dbBacked: false,
      namespace: 'config',
      virtualPath: '/cortex/config/config.json',
    }),
  },
  // /cortex/config
  {
    pattern: /^\/cortex\/config\/?$/,
    resolve: () => ({
      realPath: PATHS.configDir,
      dbBacked: false,
      namespace: 'config',
      virtualPath: '/cortex/config',
    }),
  },

  // /cortex/db/:name.db
  {
    pattern: /^\/cortex\/db\/cortex\.db$/,
    resolve: () => ({
      realPath: PATHS.db,
      dbBacked: true,
      dbTable: 'main',
      namespace: 'db',
      virtualPath: '/cortex/db/cortex.db',
    }),
  },
  {
    pattern: /^\/cortex\/db\/memory\.db$/,
    resolve: () => ({
      realPath: PATHS.memoryDb,
      dbBacked: true,
      dbTable: 'main',
      namespace: 'db',
      virtualPath: '/cortex/db/memory.db',
    }),
  },
  {
    pattern: /^\/cortex\/db\/lens\.db$/,
    resolve: () => ({
      realPath: PATHS.lensDb,
      dbBacked: true,
      dbTable: 'main',
      namespace: 'db',
      virtualPath: '/cortex/db/lens.db',
    }),
  },
  {
    pattern: /^\/cortex\/db\/vault\.db$/,
    resolve: () => ({
      realPath: PATHS.vaultDb,
      dbBacked: true,
      dbTable: 'main',
      namespace: 'db',
      virtualPath: '/cortex/db/vault.db',
    }),
  },
  {
    pattern: /^\/cortex\/db\/plugins\.db$/,
    resolve: () => ({
      realPath: PATHS.pluginsDb,
      dbBacked: true,
      dbTable: 'main',
      namespace: 'db',
      virtualPath: '/cortex/db/plugins.db',
    }),
  },

  // /cortex/logs
  {
    pattern: /^\/cortex\/logs\/?$/,
    resolve: () => ({
      realPath: PATHS.logDir,
      dbBacked: false,
      namespace: 'logs',
      virtualPath: '/cortex/logs',
    }),
  },

  // /cortex/workspace
  {
    pattern: /^\/cortex\/workspace\/?$/,
    resolve: () => ({
      realPath: PATHS.workspacesDir,
      dbBacked: false,
      namespace: 'workspace',
      virtualPath: '/cortex/workspace',
    }),
  },

  // /cortex/plugins
  {
    pattern: /^\/cortex\/plugins\/?$/,
    resolve: () => ({
      realPath: join(PATHS.dataDir, 'plugins'),
      dbBacked: false,
      namespace: 'plugins',
      virtualPath: '/cortex/plugins',
    }),
  },
];

// ── API ──────────────────────────────────────────────────────

/** Resolve a virtual /cortex/... path to its real backing store. */
export function resolveVfsPath(virtualPath: string): VfsResolveResult | null {
  for (const matcher of MATCHERS) {
    const match = virtualPath.match(matcher.pattern);
    if (match) return matcher.resolve(match);
  }
  return null;
}

/** List all known virtual paths. */
export function listVfsPaths(): string[] {
  const seen = new Set<string>();
  for (const matcher of MATCHERS) {
    const fake = Object.assign([''], { index: 0, input: '', groups: undefined }) as unknown as RegExpMatchArray;
    const result = matcher.resolve(fake);
    if (!seen.has(result.virtualPath)) {
      seen.add(result.virtualPath);
    }
  }
  return [...seen];
}

/** Get all virtual paths within a namespace. */
export function listVfsByNamespace(ns: VfsNamespace): string[] {
  const seen = new Set<string>();
  const fake = Object.assign([''], { index: 0, input: '', groups: undefined }) as unknown as RegExpMatchArray;
  for (const matcher of MATCHERS) {
    const result = matcher.resolve(fake);
    if (result.namespace === ns && !seen.has(result.virtualPath)) {
      seen.add(result.virtualPath);
    }
  }
  return [...seen];
}

/** Get the root VFS path. */
export function vfsRoot(): string {
  return '/cortex';
}

/** Get a human-readable tree representation of the VFS. */
export function vfsTree(): string {
  const lines: string[] = ['/cortex/'];
  const namespaces = new Set<string>();
  const fake = Object.assign([''], { index: 0, input: '', groups: undefined }) as unknown as RegExpMatchArray;
  for (const matcher of MATCHERS) {
    const result = matcher.resolve(fake);
    namespaces.add(`  ${result.namespace}/`);
  }
  for (const ns of [...namespaces].sort()) {
    lines.push(`${ns}`);
    for (const matcher of MATCHERS) {
      const result = matcher.resolve(fake);
      if (result.namespace === ns.slice(2, -1)) {
        const suffix = result.dbBacked ? ' [db]' : '';
        const name = result.virtualPath.split('/').filter(Boolean).slice(1).join('/');
        if (name && name !== result.namespace) {
          lines.push(`    ${name}${suffix}`);
        }
      }
    }
  }
  return lines.join('\n');
}
