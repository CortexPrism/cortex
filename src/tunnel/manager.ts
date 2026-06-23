/**
 * Tunnel Manager — Tailscale Funnel / Serve and Cloudflare Zero Trust (cloudflared)
 *
 * Manages the lifecycle of a single long-running tunnel process.  The process
 * is kept in module-level state so it survives across HTTP request handlers
 * and CLI invocations within the same Deno process.
 */
import { logger } from '../utils/logger.ts';
import type { CloudflareConfig, TailscaleConfig, TunnelConfig } from '../config/config.ts';

const _log = logger('tunnel');

export type TunnelStatus = 'stopped' | 'starting' | 'running' | 'error';

export interface TunnelState {
  status: TunnelStatus;
  provider: string;
  /** Public URL advertised by the tunnel (extracted from process output) */
  url: string | null;
  pid: number | null;
  startedAt: string | null;
  error: string | null;
  /** Recent output lines (tail-100) for diagnostics */
  recentOutput: string[];
}

// ── Module-level runtime state ────────────────────────────────────────────────

let _process: Deno.ChildProcess | null = null;
let _state: TunnelState = {
  status: 'stopped',
  provider: '',
  url: null,
  pid: null,
  startedAt: null,
  error: null,
  recentOutput: [],
};

function pushOutput(line: string): void {
  _state.recentOutput.push(line);
  if (_state.recentOutput.length > 100) _state.recentOutput.shift();
}

// ── URL extraction helpers ────────────────────────────────────────────────────

/** Cloudflare quick-tunnel prints a trycloudflare.com URL to stderr */
function extractCloudflareUrl(line: string): string | null {
  const m = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i) ??
    line.match(/https:\/\/[^\s]+/);
  return m ? m[0] : null;
}

/** Tailscale Funnel / Serve prints the public URL to stdout */
function extractTailscaleUrl(line: string): string | null {
  const m = line.match(/https:\/\/[^\s]+\.ts\.net[^\s]*/i) ??
    line.match(/Available on the internet as\s+(https:\/\/[^\s]+)/i);
  return m ? (m[1] ?? m[0]) : null;
}

// ── Process reader — drains stdout/stderr and updates state ──────────────────

async function drainStream(
  stream: ReadableStream<Uint8Array>,
  provider: 'tailscale' | 'cloudflare',
): Promise<void> {
  const dec = new TextDecoder();
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = dec.decode(value, { stream: true });
      for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (!line) continue;
        pushOutput(line);
        _log.info(`[${provider}] ${line}`);

        if (_state.url === null) {
          const url = provider === 'tailscale'
            ? extractTailscaleUrl(line)
            : extractCloudflareUrl(line);
          if (url) {
            _state.url = url;
            _state.status = 'running';
            _log.warn(`Tunnel URL: ${url}`);
          }
        }
      }
    }
  } catch {
    // Stream closed — normal on stop
  } finally {
    reader.releaseLock();
  }
}

// ── Tailscale ─────────────────────────────────────────────────────────────────

async function startTailscale(cfg: TailscaleConfig, localPort: number): Promise<void> {
  const bin = cfg.bin ?? 'tailscale';
  const port = cfg.port ?? localPort;
  const useFunnel = cfg.funnel !== false;

  // tailscale funnel --bg <port>  — makes it publicly accessible
  // tailscale serve   --bg <port>  — tailnet-only
  const subCmd = useFunnel ? 'funnel' : 'serve';

  _log.info(`Starting Tailscale ${subCmd} on port ${port}`);

  const cmd = new Deno.Command(bin, {
    args: [subCmd, '--bg', String(port)],
    stdout: 'piped',
    stderr: 'piped',
  });

  try {
    const proc = cmd.spawn();
    _process = proc;
    _state.pid = proc.pid;
    _state.startedAt = new Date().toISOString();
    _state.provider = 'tailscale';

    // Drain output asynchronously — URL appears quickly in stdout/stderr
    drainStream(proc.stdout, 'tailscale').catch(() => {});
    drainStream(proc.stderr, 'tailscale').catch(() => {});

    // tailscale funnel --bg exits 0 after registering; wait for it
    const status = await proc.status;
    if (!status.success && _state.status !== 'stopped') {
      _state.status = 'error';
      _state.error = `tailscale exited with code ${status.code}`;
      _process = null;
    } else if (_state.status !== 'stopped') {
      // bg mode: process exits successfully after registering the serve rule
      // The tunnel is now handled by the tailscale daemon; mark running
      if (_state.url === null) {
        // URL not parsed from output — query it
        await queryTailscaleStatus(bin, String(port), useFunnel);
      }
      _state.status = 'running';
      _process = null;
    }
  } catch (e) {
    _state.status = 'error';
    _state.error = (e as Error).message;
    _process = null;
    throw e;
  }
}

async function queryTailscaleStatus(
  bin: string,
  port: string,
  funnel: boolean,
): Promise<void> {
  try {
    const subCmd = funnel ? 'funnel' : 'serve';
    const proc = new Deno.Command(bin, {
      args: [subCmd, 'status'],
      stdout: 'piped',
      stderr: 'piped',
    });
    const out = await proc.output();
    const text = new TextDecoder().decode(out.stdout) +
      new TextDecoder().decode(out.stderr);
    for (const line of text.split('\n')) {
      const url = extractTailscaleUrl(line);
      if (url) {
        _state.url = url;
        break;
      }
    }
    pushOutput(text.trim());
  } catch {
    // Non-critical — URL just stays null
  }
}

async function stopTailscale(cfg: TailscaleConfig, localPort: number): Promise<void> {
  const bin = cfg.bin ?? 'tailscale';
  const port = cfg.port ?? localPort;
  const useFunnel = cfg.funnel !== false;
  const subCmd = useFunnel ? 'funnel' : 'serve';

  try {
    const proc = new Deno.Command(bin, {
      args: [subCmd, '--bg', 'off'],
      stdout: 'piped',
      stderr: 'piped',
    });
    const out = await proc.output();
    pushOutput(new TextDecoder().decode(out.stdout).trim());
    pushOutput(new TextDecoder().decode(out.stderr).trim());
    _log.info(`Tailscale ${subCmd} off (port ${port})`);
  } catch (e) {
    _log.warn(`Failed to disable Tailscale ${subCmd}: ${(e as Error).message}`);
  }
}

// ── Cloudflare ────────────────────────────────────────────────────────────────

async function startCloudflare(cfg: CloudflareConfig, localPort: number): Promise<void> {
  const bin = cfg.bin ?? 'cloudflared';
  const localUrl = `http://localhost:${localPort}`;

  let args: string[];

  if (cfg.tunnelName) {
    // Named / pre-configured tunnel
    args = ['tunnel', '--no-autoupdate', 'run'];
    if (cfg.credentialsFile) args.push('--credentials-file', cfg.credentialsFile);
    if (cfg.hostname) args.push('--hostname', cfg.hostname);
    args.push(cfg.tunnelName);
  } else {
    // Quick tunnel — no account needed
    args = ['tunnel', '--no-autoupdate', '--url', localUrl];
  }

  _log.info(`Starting cloudflared with args: ${args.join(' ')}`);

  const cmd = new Deno.Command(bin, {
    args,
    stdout: 'piped',
    stderr: 'piped',
  });

  try {
    const proc = cmd.spawn();
    _process = proc;
    _state.pid = proc.pid;
    _state.startedAt = new Date().toISOString();
    _state.provider = 'cloudflare';

    // cloudflared is long-running; drain streams continuously
    drainStream(proc.stdout, 'cloudflare').catch(() => {});
    drainStream(proc.stderr, 'cloudflare').catch(() => {});

    // Give it up to 15 s to print the URL before we mark it running anyway
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline && _state.url === null && _state.status !== 'error') {
      await new Promise((r) => setTimeout(r, 200));
    }

    if (_state.status !== 'error' && _state.status !== 'stopped') {
      _state.status = 'running';
    }

    // Monitor process in background
    proc.status.then((s) => {
      if (_state.status !== 'stopped') {
        _state.status = s.success ? 'stopped' : 'error';
        _state.error = s.success ? null : `cloudflared exited with code ${s.code}`;
        _state.pid = null;
        _process = null;
      }
    }).catch(() => {});
  } catch (e) {
    _state.status = 'error';
    _state.error = (e as Error).message;
    _process = null;
    throw e;
  }
}

function stopCloudflare(): void {
  if (_process) {
    try {
      _process.kill('SIGTERM');
    } catch {
      // Already dead
    }
    _process = null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getTunnelStatus(): TunnelState {
  return { ..._state, recentOutput: [..._state.recentOutput] };
}

export async function startTunnel(config: TunnelConfig, serverPort: number): Promise<TunnelState> {
  if (_state.status === 'running' || _state.status === 'starting') {
    return getTunnelStatus();
  }

  _state = {
    status: 'starting',
    provider: config.provider,
    url: null,
    pid: null,
    startedAt: null,
    error: null,
    recentOutput: [],
  };

  const localPort = config.localPort ?? serverPort;

  try {
    if (config.provider === 'tailscale') {
      await startTailscale(config.tailscale ?? {}, localPort);
    } else if (config.provider === 'cloudflare') {
      await startCloudflare(config.cloudflare ?? {}, localPort);
    } else {
      throw new Error(`Unknown tunnel provider: ${config.provider}`);
    }
  } catch (e) {
    _state.status = 'error';
    _state.error = (e as Error).message;
  }

  return getTunnelStatus();
}

export async function stopTunnel(config: TunnelConfig, serverPort: number): Promise<TunnelState> {
  if (_state.status === 'stopped') return getTunnelStatus();

  const localPort = config.localPort ?? serverPort;

  if (config.provider === 'tailscale') {
    await stopTailscale(config.tailscale ?? {}, localPort);
  } else if (config.provider === 'cloudflare') {
    stopCloudflare();
  }

  _state = {
    status: 'stopped',
    provider: config.provider,
    url: null,
    pid: null,
    startedAt: null,
    error: null,
    recentOutput: _state.recentOutput,
  };

  return getTunnelStatus();
}
