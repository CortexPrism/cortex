import {
  ensureSocketDir,
  EXECUTOR_SOCK,
  SCHEDULER_SOCK,
  VALIDATOR_SOCK,
} from '../ipc/transport.ts';
import { fromFileUrl, join } from '@std/path';
import { isWindows } from '../utils/platform.ts';
import { PATHS } from '../config/paths.ts';

interface ProcDef {
  name: string;
  label: string;
  sock: string;
}

const PROCESS_DEFS: ProcDef[] = [
  { name: 'validator', label: 'Cortex Validator', sock: VALIDATOR_SOCK },
  { name: 'executor', label: 'Cortex Executor', sock: EXECUTOR_SOCK },
  { name: 'scheduler', label: 'Cortex Scheduler', sock: SCHEDULER_SOCK },
];

const parentsToKill = new Set<number>();

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
    stdout: 'null',
    stderr: 'piped',
    stdin: 'null',
  });
  const child = cmd.spawn();
  parentsToKill.add(child.pid);

  (async () => {
    try {
      const file = await Deno.open(logPath, { write: true, create: true, append: true });
      try {
        for await (const chunk of child.stderr) {
          await file.write(chunk);
        }
      } finally {
        file.close();
      }
    } catch { /* best-effort logging */ }
  })();

  return child;
}

export async function runSupervisor(): Promise<void> {
  const children = new Map<
    string,
    { proc: ProcDef; process: Deno.ChildProcess; restartCount: number }
  >();

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

    (async () => {
      const status = await process.status;
      parentsToKill.delete(process.pid);
      if (!children.has(proc.name)) return;
      console.log(`[supervisor] ${proc.label} exited (code ${status.code})`);
      if (status.code !== 0) {
        children.delete(proc.name);
        startOne(proc);
      } else {
        children.delete(proc.name);
      }
    })();
  }

  for (const proc of PROCESS_DEFS) {
    await startOne(proc);
  }

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
