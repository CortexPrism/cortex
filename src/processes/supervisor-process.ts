import {
  ensureSocketDir,
  EXECUTOR_SOCK,
  pingProcess,
  SCHEDULER_SOCK,
  VALIDATOR_SOCK,
} from '../ipc/transport.ts';
import { fromFileUrl, join } from '@std/path';
import { isWindows } from '../utils/platform.ts';
import { PATHS } from '../config/paths.ts';
import { BOOT_ORDER, type BootStage } from '../config/config.ts';

interface ProcDef {
  name: string;
  label: string;
  sock: string;
  /** Boot stage this daemon maps to. */
  stage: BootStage;
}

const PROCESS_DEFS: ProcDef[] = [
  { name: 'validator', label: 'Cortex Validator', sock: VALIDATOR_SOCK, stage: 'validator' },
  { name: 'executor', label: 'Cortex Executor', sock: EXECUTOR_SOCK, stage: 'executor' },
  { name: 'scheduler', label: 'Cortex Scheduler', sock: SCHEDULER_SOCK, stage: 'scheduler' },
];

const READINESS_TIMEOUT_MS = 10_000;
const READINESS_POLL_MS = 250;

const parentsToKill = new Set<number>();

// ── Boot stage tracking ──────────────────────────────────────

interface StageState {
  stage: BootStage;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

const stageStates = new Map<BootStage, StageState>();

function initStages(): void {
  for (const stage of BOOT_ORDER) {
    stageStates.set(stage, { stage, status: 'pending' });
  }
}

export function getBootStatus(): StageState[] {
  return BOOT_ORDER.map((s) => stageStates.get(s)!);
}

// ── Helpers ──────────────────────────────────────────────────

function isCompiledBinary(): boolean {
  const p = Deno.execPath();
  const name = p.split('/').pop()?.split('\\').pop() || '';
  return name !== 'deno' && name !== 'deno.exe';
}

function getMainEntryPath(): string {
  return fromFileUrl(new URL('../main.ts', import.meta.url));
}

async function spawnDaemon(proc: ProcDef): Promise<Deno.ChildProcess> {
  await ensureSocketDir();
  await Deno.mkdir(PATHS.logDir, { recursive: true });
  const logPath = join(PATHS.logDir, `daemon-${proc.name}.log`);

  const execPath = Deno.execPath();
  const args: string[] = isCompiledBinary()
    ? ['--subprocess', proc.name]
    : ['run', '--allow-all', getMainEntryPath(), '--subprocess', proc.name];

  const cmd = new Deno.Command(execPath, {
    args,
    stdout: 'piped',
    stderr: 'piped',
    stdin: 'null',
  });
  const child = cmd.spawn();
  parentsToKill.add(child.pid);

  (async () => {
    try {
      const file = await Deno.open(logPath, { write: true, create: true, append: true });
      try {
        const writeStream = (stream: ReadableStream<Uint8Array>) =>
          (async () => {
            try {
              for await (const chunk of stream) await file.write(chunk);
            } catch { /* best-effort */ }
          })();
        await Promise.all([writeStream(child.stdout), writeStream(child.stderr)]);
      } finally {
        file.close();
      }
    } catch { /* best-effort logging */ }
  })();

  return child;
}

/** Wait for a daemon to become ready by polling its IPC socket. */
async function waitForReady(proc: ProcDef): Promise<boolean> {
  const deadline = Date.now() + READINESS_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const alive = await pingProcess(proc.sock);
      if (alive) return true;
    } catch { /* socket not ready yet */ }
    await new Promise((r) => setTimeout(r, READINESS_POLL_MS));
  }
  return false;
}

// ── Supervisor (init system) ─────────────────────────────────

export async function runSupervisor(): Promise<void> {
  initStages();
  const children = new Map<
    string,
    { proc: ProcDef; process: Deno.ChildProcess; restartCount: number }
  >();

  function markStage(stage: BootStage, status: StageState['status'], error?: string): void {
    const state = stageStates.get(stage);
    if (!state) return;
    state.status = status;
    if (status === 'running') state.startedAt = Date.now();
    if (status === 'completed' || status === 'failed') state.completedAt = Date.now();
    if (error) state.error = error;
  }

  async function startOne(proc: ProcDef): Promise<void> {
    const existing = children.get(proc.name);
    const restartCount = existing ? existing.restartCount + 1 : 0;

    if (restartCount > 0) {
      const delay = Math.min(Math.pow(2, restartCount) * 1000, 30000);
      console.log(
        `[supervisor] ${proc.label} crashed. Restarting in ${
          delay / 1000
        }s (attempt ${restartCount})...`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }

    const process = await spawnDaemon(proc);
    children.set(proc.name, { proc, process, restartCount });
    console.log(`[supervisor] ${proc.label} started (pid ${process.pid})`);

    // Readiness check
    const ready = await waitForReady(proc);
    if (ready) {
      console.log(`[supervisor] ${proc.label} ready`);
    } else {
      console.warn(
        `[supervisor] ${proc.label} did not report ready within ${READINESS_TIMEOUT_MS}ms`,
      );
    }

    (async () => {
      const status = await process.status;
      parentsToKill.delete(process.pid);
      if (!children.has(proc.name)) return;
      console.log(`[supervisor] ${proc.label} exited (code ${status.code})`);
      if (status.code !== 0) {
        children.delete(proc.name);
        markStage(proc.stage, 'failed', `exit code ${status.code}`);
        startOne(proc);
      } else {
        children.delete(proc.name);
        markStage(proc.stage, 'completed');
      }
    })();
  }

  // ── Ordered boot sequence ──────────────────────────────────

  markStage('supervisor', 'completed');
  const daemonDefs = PROCESS_DEFS; // validator, executor, scheduler

  for (const stage of BOOT_ORDER) {
    const def = daemonDefs.find((d) => d.stage === stage);
    if (!def) continue; // skip non-daemon stages (migrate, services, channels, ready)

    markStage(stage, 'running');
    await startOne(def);
    markStage(stage, 'completed');
  }

  markStage('ready', 'completed');
  console.log('[supervisor] Boot sequence complete');

  // ── Shutdown ───────────────────────────────────────────────

  const shutdown = () => {
    console.log('\n[supervisor] Shutting down...');
    for (const [name, child] of children) {
      try {
        child.process.kill(isWindows() ? undefined : 'SIGTERM');
      } catch { /* ignore */ }
      children.delete(name);
    }
    Deno.exit(0);
  };

  try {
    Deno.addSignalListener('SIGINT', shutdown);
    Deno.addSignalListener('SIGTERM', shutdown);
  } catch {
    // signal listeners not available in all Deno runtimes
  }

  await new Promise(() => {});
}

if (import.meta.main) {
  await runSupervisor();
}
