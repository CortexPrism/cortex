import { createClient, type InValue } from 'npm:@libsql/client';
export type { InValue };
import { PATHS } from '../config/paths.ts';

function splitSql(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (!inSingleQuote && !inDoubleQuote && ch === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }

    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
    } else if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    }

    if (!inSingleQuote && !inDoubleQuote) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === ';' && depth === 0) {
        const stmt = current.trim();
        if (stmt.length > 0) statements.push(stmt);
        current = '';
        i++;
        continue;
      }
    }

    current += ch;
    i++;
  }

  const last = current.trim();
  if (last.length > 0) statements.push(last);
  return statements;
}

export type LibSQLClient = ReturnType<typeof createClient>;

const WAL_PRAGMAS = [
  'PRAGMA journal_mode = WAL',
  'PRAGMA synchronous = NORMAL',
  'PRAGMA busy_timeout = 5000',
  'PRAGMA foreign_keys = ON',
  'PRAGMA cache_size = -64000',
  'PRAGMA temp_store = MEMORY',
];

export class Db {
  readonly client: LibSQLClient;

  constructor(path: string) {
    const normalized = path.replace(/\\/g, '/');
    this.client = createClient({ url: `file:${normalized}` });
  }

  async init(): Promise<void> {
    for (const pragma of WAL_PRAGMAS) {
      await this.client.execute(pragma);
    }
  }

  async exec(sql: string): Promise<void> {
    const statements = splitSql(sql);
    for (const stmt of statements) {
      await this.client.execute(stmt);
    }
  }

  async get<T = Record<string, unknown>>(
    sql: string,
    args: InValue[] = [],
  ): Promise<T | undefined> {
    const result = await this.client.execute({ sql, args });
    if (result.rows.length === 0) return undefined;
    return result.rows[0] as T;
  }

  async all<T = Record<string, unknown>>(
    sql: string,
    args: InValue[] = [],
  ): Promise<T[]> {
    const result = await this.client.execute({ sql, args });
    return result.rows as T[];
  }

  async run(sql: string, args: InValue[] = []): Promise<void> {
    await this.client.execute({ sql, args });
  }

  async insert(sql: string, args: InValue[] = []): Promise<number> {
    const result = await this.client.execute({ sql, args });
    return Number(result.lastInsertRowid ?? 0);
  }

  close(): void {
    this.client.close();
  }
}

/** No-op database stub for subprocesses that must not touch a shared DB. */
class NoopDb extends Db {
  constructor() { super(':memory:'); }
  override async init(): Promise<void> {}
  override async exec(_sql: string): Promise<void> {}
  override async get<T = Record<string, unknown>>(_sql: string, _args: InValue[] = []): Promise<T | undefined> { return undefined; }
  override async all<T = Record<string, unknown>>(_sql: string, _args: InValue[] = []): Promise<T[]> { return []; }
  override async run(_sql: string, _args: InValue[] = []): Promise<void> {}
  override async insert(_sql: string, _args: InValue[] = []): Promise<number> { return 0; }
  override close(): void {}
}

async function openDb(path: string): Promise<Db> {
  const db = new Db(path);
  await db.init();
  return db;
}

let _coreDb: Db | null = null;
let _memoryDb: Db | null = null;
let _lensDb: Db | null = null;
let _vaultDb: Db | null = null;
let _pluginsDb: Db | null = null;

export async function getCoreDb(): Promise<Db> {
  if (!_coreDb) _coreDb = await openDb(PATHS.db);
  return _coreDb;
}

export async function getMemoryDb(): Promise<Db> {
  if (!_memoryDb) _memoryDb = await openDb(PATHS.memoryDb);
  return _memoryDb;
}

export async function getLensDb(): Promise<Db> {
  if (Deno.env.get('CORTEX_NOLENS')) {
    if (!_lensDb) _lensDb = new NoopDb();
    return _lensDb;
  }
  if (!_lensDb) _lensDb = await openDb(PATHS.lensDb);
  return _lensDb;
}

export async function getVaultDb(): Promise<Db> {
  if (!_vaultDb) _vaultDb = await openDb(PATHS.vaultDb);
  return _vaultDb;
}

export async function getPluginsDb(): Promise<Db> {
  if (!_pluginsDb) _pluginsDb = await openDb(PATHS.pluginsDb);
  return _pluginsDb;
}

export async function getSessionDb(sessionId: string): Promise<Db> {
  return await openDb(PATHS.sessionDb(sessionId));
}

export function closeAll(): void {
  _coreDb?.close();
  _memoryDb?.close();
  _lensDb?.close();
  _vaultDb?.close();
  _pluginsDb?.close();
  _coreDb =
    _memoryDb =
    _lensDb =
    _vaultDb =
    _pluginsDb =
      null;
}
