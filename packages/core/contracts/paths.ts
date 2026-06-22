export interface IAppPaths {
  projectRoot: string;
  dataDir: string;
  configDir: string;
  localesDir: string;
  db: string;
  memoryDb: string;
  lensDb: string;
  vaultDb: string;
  pluginsDb: string;
  sessionsDir: string;
  migrationsDir: string;
  vaultSaltFile: string;
  configFile: string;
  soulFile: string;
  userFile: string;
  memoryFile: string;
  backupsDir: string;
  workspacesDir: string;
  installManifest: string;
  updateCache: string;
  updateLock: string;
  voiceDataDir: string;
  serverLog: string;
  logDir: string;
  logFile: string;
  sessionDb(sessionId: string): string;
}
