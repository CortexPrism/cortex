export * from './contracts/mod.ts';
export * from './contracts/config.ts';
export * from './contracts/database.ts';
export * from './contracts/logging.ts';
export * from './contracts/i18n.ts';
export * from './contracts/paths.ts';
export * from './contracts/plugins.ts';

export { loadConfig, saveConfig } from './src/config/config.ts';
export { PATHS } from './src/config/paths.ts';
export { VERSION } from './src/config/version.ts';

export { closeAll, getCoreDb, getPluginsDb } from './src/db/client.ts';
export { runMigrations } from './src/db/migrate.ts';

export { logger } from './src/utils/logger.ts';
export type { LogLevel } from './src/utils/logger.ts';
export { isCompiledBinary, resolveHomeDir } from './src/utils/platform.ts';
export type { Platform } from './src/utils/platform.ts';
