import { fromFileUrl, join } from '@std/path';
import { isCompiledBinary, resolveHomeDir } from '../utils/platform.ts';

function resolveDataDir(): string {
  const envOverride = Deno.env.get('CORTEX_DATA_DIR');
  if (envOverride) return envOverride;

  const home = resolveHomeDir();
  return join(home, '.cortex', 'data');
}

function resolveConfigDir(): string {
  const envOverride = Deno.env.get('CORTEX_CONFIG_DIR');
  if (envOverride) return envOverride;

  const home = resolveHomeDir();
  return join(home, '.cortex');
}

function resolveLocalesDir(): string {
  const envOverride = Deno.env.get('CORTEX_LOCALES_DIR');
  if (envOverride) return envOverride;

  // In compiled binary mode, import.meta.url points to the binary path,
  // so resolve relative to CWD instead
  if (isCompiledBinary()) {
    return join(Deno.cwd(), 'locales');
  }

  return join(fromFileUrl(new URL('../../../../', import.meta.url)), 'locales');
}

const _projectRoot: string = fromFileUrl(new URL('../../../../', import.meta.url));

export interface PathsConfig {
  projectRoot: string;
  dataDir: string;
  configDir: string;
  localesDir: string;
  readonly db: string;
  readonly memoryDb: string;
  readonly lensDb: string;
  readonly vaultDb: string;
  readonly pluginsDb: string;
  readonly sessionsDir: string;
  readonly migrationsDir: string;
  readonly vaultSaltFile: string;
  readonly configFile: string;
  readonly soulFile: string;
  readonly userFile: string;
  readonly memoryFile: string;
  readonly backupsDir: string;
  readonly workspacesDir: string;
  readonly installManifest: string;
  readonly updateCache: string;
  readonly updateLock: string;
  readonly voiceDataDir: string;
  readonly serverLog: string;
  readonly logDir: string;
  readonly logFile: string;
  sessionDb(sessionId: string): string;
}

export const PATHS: PathsConfig = {
  projectRoot: _projectRoot,
  dataDir: resolveDataDir(),
  configDir: resolveConfigDir(),
  localesDir: resolveLocalesDir(),

  get db() {
    return join(this.dataDir, 'cortex.db');
  },
  get memoryDb() {
    return join(this.dataDir, 'memory.db');
  },
  get lensDb() {
    return join(this.dataDir, 'lens.db');
  },
  get vaultDb() {
    return join(this.dataDir, 'vault.db');
  },
  get pluginsDb() {
    return join(this.dataDir, 'plugins.db');
  },
  get sessionsDir() {
    return join(this.dataDir, 'sessions');
  },
  get migrationsDir() {
    return join(this.configDir, 'migrations');
  },
  get vaultSaltFile() {
    return join(this.dataDir, 'vault_salt');
  },

  get configFile() {
    return join(this.configDir, 'config.json');
  },
  get soulFile() {
    return join(this.configDir, 'SOUL.md');
  },
  get userFile() {
    return join(this.configDir, 'USER.md');
  },
  get memoryFile() {
    return join(this.configDir, 'MEMORY.md');
  },
  get backupsDir() {
    return join(this.dataDir, 'backups');
  },
  get workspacesDir() {
    return join(this.dataDir, 'workspaces');
  },

  get installManifest() {
    return join(this.configDir, 'install.json');
  },
  get updateCache() {
    return join(this.configDir, 'update-cache.json');
  },
  get updateLock() {
    return join(this.configDir, 'update.lock');
  },

  get voiceDataDir() {
    return join(this.dataDir, 'voice');
  },

  get serverLog() {
    return join(this.dataDir, 'server.log');
  },

  get logDir() {
    return join(this.dataDir, 'logs');
  },

  get logFile() {
    return join(this.dataDir, 'logs', 'cortex.log');
  },

  sessionDb(sessionId: string): string {
    return join(this.sessionsDir, `${sessionId}.db`);
  },
};
