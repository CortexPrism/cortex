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
