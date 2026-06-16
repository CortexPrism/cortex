import { isWindows } from './platform.ts';

export async function makeExecutable(path: string): Promise<void> {
  if (isWindows()) {
    return;
  }
  await Deno.chmod(path, 0o755);
}

export async function makePrivate(path: string): Promise<void> {
  if (isWindows()) {
    return;
  }
  await Deno.chmod(path, 0o600);
}
