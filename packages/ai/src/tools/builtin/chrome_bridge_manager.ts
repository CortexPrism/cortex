import type { ChromeBridgeConfig } from '../../../../../src/config/config.ts';
import type { ToolRegistry } from '../registry.ts';
import { callStdioTool, connectStdio, disconnectStdio, getConnection } from '../../../../../src/mcp/client.ts';
import { logger } from '../../../../../src/utils/logger.ts';
import { CHROME_BRIDGE_CAPABILITIES } from './chrome_bridge_capabilities.ts';

const _log = logger('chrome-bridge:manager');

const CONNECTION_NAME = 'chrome-bridge';
const HEALTH_CHECK_MS = 30_000;
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 100;
const MAX_BACKOFF_MS = 1600;

let _running = false;
let _healthTimer: ReturnType<typeof setInterval> | null = null;
let _retryCount = 0;
let _retryTimer: ReturnType<typeof setTimeout> | null = null;

export function isChromeBridgeRunning(): boolean {
  return _running && getConnection(CONNECTION_NAME)?.connected === true;
}

export async function startChromeBridge(config: ChromeBridgeConfig): Promise<void> {
  if (_running) {
    _log.warn('chrome-bridge is already running');
    return;
  }

  const nodePath = config.nodePath ?? 'node';
  const serverPath = config.serverPath;

  _log.info(`Starting chrome-bridge: ${nodePath} ${serverPath}`);

  try {
    await connectStdio({
      name: CONNECTION_NAME,
      transport: 'stdio',
      command: nodePath,
      args: [serverPath],
      env: config.env,
    });

    _running = true;
    _log.info('chrome-bridge connected successfully');

    startHealthCheck(config);
  } catch (err) {
    _log.error(`Failed to start chrome-bridge: ${(err as Error).message}`);

    if (config.nodePath) {
      _log.error(`Verify Node.js is installed at: ${config.nodePath}`);
    }
    _log.error(`Verify chrome-bridge server exists at: ${config.serverPath}`);

    throw err;
  }
}

export async function stopChromeBridge(): Promise<void> {
  _running = false;
  _retryCount = 0;
  stopHealthCheck();
  clearRetryTimer();

  try {
    await disconnectStdio(CONNECTION_NAME);
    _log.info('chrome-bridge stopped');
  } catch (err) {
    _log.warn(`Error stopping chrome-bridge: ${(err as Error).message}`);
  }
}

function startHealthCheck(config: ChromeBridgeConfig): void {
  stopHealthCheck();

  _healthTimer = setInterval(async () => {
    if (!_running) return;

    try {
      await callStdioTool(CONNECTION_NAME, 'get_status', {});
    } catch {
      _log.warn('chrome-bridge health check failed');

      const conn = getConnection(CONNECTION_NAME);
      if (!conn?.connected) {
        _log.warn('chrome-bridge connection lost, attempting reconnect');
        await attemptReconnect(config);
      }
    }
  }, HEALTH_CHECK_MS);
}

function stopHealthCheck(): void {
  if (_healthTimer) {
    clearInterval(_healthTimer);
    _healthTimer = null;
  }
}

function clearRetryTimer(): void {
  if (_retryTimer) {
    clearTimeout(_retryTimer);
    _retryTimer = null;
  }
}

async function attemptReconnect(config: ChromeBridgeConfig): Promise<void> {
  if (_retryCount >= MAX_RETRIES) {
    _log.error(`chrome-bridge reconnect failed after ${MAX_RETRIES} attempts`);
    _running = false;
    return;
  }

  const backoff = Math.min(INITIAL_BACKOFF_MS * Math.pow(2, _retryCount), MAX_BACKOFF_MS);
  _retryCount++;
  _log.info(`Reconnecting chrome-bridge in ${backoff}ms (attempt ${_retryCount}/${MAX_RETRIES})`);

  clearRetryTimer();
  _retryTimer = setTimeout(async () => {
    try {
      _running = false;
      await disconnectStdio(CONNECTION_NAME).catch(() => {});
      await startChromeBridge(config);
      _log.info('chrome-bridge reconnected successfully');
    } catch (err) {
      _log.error(`Reconnect attempt ${_retryCount} failed: ${(err as Error).message}`);
    }
  }, backoff);
}

export async function registerChromeBridgeTools(
  registry: ToolRegistry,
  config: ChromeBridgeConfig,
): Promise<number> {
  const prefix = config.toolPrefix ?? 'chrome_';
  const conn = getConnection(CONNECTION_NAME);

  if (!conn?.connected) {
    _log.warn('chrome-bridge not connected, cannot register tools');
    await startChromeBridge(config);
  }

  const count = await registry.registerMcpConnection(
    CONNECTION_NAME,
    prefix,
    CHROME_BRIDGE_CAPABILITIES,
  );

  _log.info(`Registered ${count} chrome-bridge tools with prefix "${prefix}"`);
  return count;
}
