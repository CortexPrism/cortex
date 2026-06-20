import { join } from '@std/path';
import { debugLog, depsLog } from './logger.ts';
import type { DependencyManifest } from './snapshot-types.ts';

export async function detectDependencies(workspacePath: string): Promise<DependencyManifest> {
  debugLog(depsLog, `detecting dependencies in: ${workspacePath}`);
  let first: DependencyManifest | null = null;

  try {
    const content = await Deno.readTextFile(join(workspacePath, 'package.json'));
    const pkg = JSON.parse(content);
    const deps = Object.assign({}, pkg.dependencies ?? {}, pkg.devDependencies ?? {});
    const lockFileExists = await existsAny(workspacePath, [
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      'bun.lockb',
    ]);
    first = {
      language: 'javascript',
      packages: deps,
      lockFileExists,
      managerHint: await resolveJsManager(workspacePath),
    };
  } catch { /* no package.json */ }

  try {
    const reqContent = await Deno.readTextFile(join(workspacePath, 'requirements.txt'));
    const pkgs: Record<string, string> = {};
    for (const line of reqContent.split('\n').filter(Boolean)) {
      const [name, version] = line.split('==');
      if (name) pkgs[name] = version ?? '*';
    }
    const manifest = {
      language: 'python',
      packages: pkgs,
      lockFileExists: false,
      managerHint: 'pip',
    };
    if (!first) first = manifest;
  } catch { /* no requirements.txt */ }

  if (!first) {
    for (const candidate of ['Cargo.toml', 'go.mod', 'Gemfile']) {
      try {
        await Deno.stat(join(workspacePath, candidate));
        const lang = candidate === 'Cargo.toml' ? 'rust' : candidate === 'go.mod' ? 'go' : 'ruby';
        const mgr = lang === 'rust' ? 'cargo' : lang === 'go' ? 'go modules' : 'bundler';
        first = { language: lang, packages: {}, lockFileExists: false, managerHint: mgr };
        break;
      } catch {
        continue;
      }
    }
  }

  const result = first ??
    { language: 'unknown', packages: {}, lockFileExists: false, managerHint: 'none' };
  debugLog(depsLog, `dependency detection complete`, {
    language: result.language,
    manager: result.managerHint,
    packageCount: Object.keys(result.packages).length,
  });
  return result;
}

async function resolveJsManager(wsPath: string): Promise<string> {
  try {
    await Deno.stat(join(wsPath, 'pnpm-lock.yaml'));
    return 'pnpm';
  } catch { /* not found */ }
  try {
    await Deno.stat(join(wsPath, 'yarn.lock'));
    return 'yarn';
  } catch { /* not found */ }
  try {
    await Deno.stat(join(wsPath, 'bun.lockb'));
    return 'bun';
  } catch { /* not found */ }
  return 'npm';
}

async function existsAny(basePath: string, files: string[]): Promise<boolean> {
  for (const f of files) {
    try {
      await Deno.stat(join(basePath, f));
      return true;
    } catch { /* not found */ }
  }
  return false;
}
