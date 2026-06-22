export type Platform = 'linux' | 'darwin' | 'windows';
export type Architecture = 'x86_64' | 'aarch64';

export function getPlatform(): Platform {
  return Deno.build.os as Platform;
}

export function getArchitecture(): Architecture {
  return Deno.build.arch === 'aarch64' ? 'aarch64' : 'x86_64';
}

export function isWindows(): boolean {
  return Deno.build.os === 'windows';
}

export function isMacOS(): boolean {
  return Deno.build.os === 'darwin';
}

export function isLinux(): boolean {
  return Deno.build.os === 'linux';
}

export function isCompiledBinary(): boolean {
  const name = Deno.execPath().split('/').pop()?.split('\\').pop() || '';
  return name !== 'deno' && name !== 'deno.exe';
}

export function getShellCommand(): { cmd: string; args: (command: string) => string[] } {
  if (isWindows()) {
    return {
      cmd: 'powershell.exe',
      args: (command: string) => ['-NoProfile', '-Command', command],
    };
  }
  return {
    cmd: 'sh',
    args: (command: string) => ['-c', command],
  };
}

export function getExeSuffix(): string {
  return isWindows() ? '.exe' : '';
}

export function resolveHomeDir(): string {
  const home = Deno.env.get('HOME') ??
    Deno.env.get('USERPROFILE') ??
    (() => {
      const drive = Deno.env.get('HOMEDRIVE');
      const path = Deno.env.get('HOMEPATH');
      return drive && path ? `${drive}${path}` : '.';
    })();
  return home;
}

export function getTempDir(): string {
  return Deno.env.get('TMPDIR') ??
    Deno.env.get('TEMP') ??
    Deno.env.get('TMP') ??
    (isWindows() ? 'C:\\Temp' : '/tmp');
}

export async function findDenoProcesses(pattern: string): Promise<number[]> {
  if (isWindows()) {
    try {
      const psCommand =
        `Get-CimInstance Win32_Process -Filter "Name='deno.exe'" | Select-Object ProcessId, CommandLine | ConvertTo-Json`;
      const proc = new Deno.Command('powershell.exe', {
        args: ['-NoProfile', '-Command', psCommand],
        stdout: 'piped',
        stderr: 'null',
      });
      const out = await proc.output();
      if (!out.success) return [];
      const text = new TextDecoder().decode(out.stdout);
      if (!text.trim()) return [];
      const items = JSON.parse(text);
      const results = (Array.isArray(items) ? items : [items]) as Array<
        { ProcessId: number; CommandLine: string }
      >;
      const regex = new RegExp(pattern);
      return results
        .filter((p) => p.ProcessId !== Deno.pid && regex.test(p.CommandLine ?? ''))
        .map((p) => p.ProcessId);
    } catch {
      return [];
    }
  }
  try {
    const pgrep = new Deno.Command('pgrep', { args: ['-f', pattern], stdout: 'piped' });
    const out = await pgrep.output();
    if (!out.success) return [];
    return new TextDecoder().decode(out.stdout).trim().split('\n').map(Number)
      .filter((p) => Boolean(p) && p !== Deno.pid);
  } catch {
    return [];
  }
}

export async function killDenoProcesses(pattern: string): Promise<void> {
  if (isWindows()) {
    try {
      const psCommand =
        `Get-CimInstance Win32_Process -Filter "Name='deno.exe'" | Where-Object { $_.CommandLine -match '${
          pattern.replace(/'/g, "''")
        }' -and $_.ProcessId -ne $pid } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`;
      const proc = new Deno.Command('powershell.exe', {
        args: ['-NoProfile', '-Command', psCommand],
        stdout: 'null',
        stderr: 'null',
      });
      await proc.output();
    } catch { /* ignore */ }
    return;
  }
  try {
    const cmd = new Deno.Command('pkill', { args: ['-f', pattern] });
    await cmd.output();
  } catch { /* ignore */ }
}

export function killChildProcess(child: Deno.ChildProcess): void {
  try {
    if (isWindows()) {
      child.kill();
    } else {
      child.kill('SIGTERM');
    }
  } catch { /* already exited */ }
}

export function killProcessById(pid: number): void {
  try {
    if (isWindows()) {
      Deno.kill(pid);
    } else {
      Deno.kill(pid, 'SIGTERM');
    }
  } catch { /* already exited */ }
}
