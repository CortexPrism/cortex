import { exists } from '@std/fs';
import { join } from '@std/path';
import { green, yellow, dim } from '@std/fmt/colors';
import { createSession, closeSession } from '../db/sessions.ts';
import { getSessionDb } from '../db/client.ts';
import type { Db } from '../db/client.ts';

interface OpenClawArtifact {
  path: string;
  name: string;
  importType: string;
}

async function findOpenClawFiles(basePath: string): Promise<OpenClawArtifact[]> {
  const artifacts: OpenClawArtifact[] = [];
  const files = ['SOUL.md', 'USER.md', 'MEMORY.md', 'AGENTS.md', 'TOOLS.md'];

  for (const file of files) {
    const fullPath = join(basePath, file);
    if (await exists(fullPath)) {
      artifacts.push({
        path: fullPath,
        name: file,
        importType: file.replace('.md', '').toLowerCase(),
      });
    }
  }

  const memoryDir = join(basePath, 'memory');
  if (await exists(memoryDir)) {
    for await (const entry of Deno.readDir(memoryDir)) {
      if (entry.isFile && entry.name.endsWith('.md')) {
        artifacts.push({
          path: join(memoryDir, entry.name),
          name: entry.name,
          importType: 'memory',
        });
      }
    }
  }

  return artifacts;
}

export async function importOpenClaw(
  sourcePath: string,
  opts?: { dryRun?: boolean },
): Promise<void> {
  const home = Deno.env.get('HOME') ?? '.';
  const configPath = sourcePath || join(home, '.openclaw');
  const configFile = join(configPath, 'config.yaml');

  console.log(green('\nCortex — OpenClaw Migration Tool'));
  console.log(dim(`Source: ${configPath}\n`));

  const hasConfig = await exists(configFile);
  if (!hasConfig) {
    console.log(yellow(`No OpenClaw config found at ${configFile}. Checking for artifacts...\n`));
  }

  const artifacts = await findOpenClawFiles(configPath);

  if (artifacts.length === 0) {
    console.log(yellow('No OpenClaw artifacts found to migrate.'));
    return;
  }

  console.log(`Found ${artifacts.length} artifact(s):\n`);
  for (const a of artifacts) {
    console.log(`  ${dim('→')} ${a.name} ${dim(`(${a.importType})`)}`);
    console.log(`    ${dim(a.path)}`);
  }
  console.log();

  if (opts?.dryRun) {
    console.log(yellow('Dry run — no changes made.'));
    return;
  }

  const PATHS = await import('../config/paths.ts').then((m) => m.PATHS);
  const cortexConfigDir = PATHS.configDir;
  await Deno.mkdir(cortexConfigDir, { recursive: true }).catch(() => {});

  for (const artifact of artifacts) {
    try {
      const content = await Deno.readTextFile(artifact.path);
      const cortexName = artifact.name === 'SOUL.md'
        ? 'SOUL.md'
        : artifact.name === 'MEMORY.md'
        ? 'MEMORY.md'
        : artifact.name;

      const destPath = join(cortexConfigDir, cortexName);
      await Deno.writeTextFile(destPath, content);
      console.log(green(`  ✓ Imported: ${artifact.name} → ${cortexName}`));

      if (artifact.importType === 'memory' || artifact.name === 'MEMORY.md') {
        const sessionId = `import_${Date.now().toString(36)}`;
        await createSession(sessionId, 'import');
        const db = await getSessionDb(sessionId);
        await importMemoryContent(db, content, artifact.name);
        await closeSession(sessionId);
      }
    } catch (e) {
      console.error(`  ✗ Failed to import ${artifact.name}: ${(e as Error).message}`);
    }
  }

  console.log(green('\n✓ Migration complete.'));
  console.log(`Run ${yellow('cortex chat')} to start using Cortex with your imported data.\n`);
}

async function importMemoryContent(db: Db, content: string, source: string): Promise<void> {
  const chunks = content.split(/\n## /).filter(Boolean);
  for (const chunk of chunks) {
    const lines = chunk.split('\n');
    const title = lines[0]?.replace(/^#+ /, '').trim() || source;
    const body = lines.slice(1).join('\n').trim().slice(0, 5000);

    if (body) {
      await db.run(
        `INSERT INTO session_messages (role, content) VALUES (?, ?)`,
        ['user', `[Imported from OpenClaw: ${title}]\n${body}`],
      );
    }
  }
}
