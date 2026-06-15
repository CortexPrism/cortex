import { Command } from '@cliffy/command';
import { bold, cyan, dim, green, red, yellow } from '@std/fmt/colors';
import { loadConfig } from '../config/config.ts';
import { buildProvider } from '../llm/router.ts';
import { runMigrations } from '../db/migrate.ts';
import { formatSandboxResult, isDockerAvailable, runInSandbox } from '../sandbox/executor.ts';
import { autofix } from '../sandbox/autofix.ts';

export const runCommand = new Command()
  .name('run')
  .description('Execute code in a sandbox with optional LLM auto-fix loop')
  .arguments('<file:string>')
  .option('-l, --lang <lang:string>', 'Language override (python, javascript, bash, typescript)')
  .option('--fix', 'Enable auto-fix loop on failure')
  .option('--max-fix <n:number>', 'Max fix rounds', { default: 4 })
  .option('--no-sandbox', 'Skip Docker, use subprocess directly')
  .action(async (
    opts: { lang?: string; fix?: boolean; maxFix: number; sandbox?: boolean },
    file: string,
  ) => {
    await runMigrations();

    const code = await Deno.readTextFile(file).catch(() => {
      console.error(red(`  Error: cannot read file: ${file}`));
      Deno.exit(1);
    });

    const lang = opts.lang ?? inferLang(file);
    const dockerAvail = await isDockerAvailable();
    const runtime = opts.sandbox === false ? 'subprocess' : (dockerAvail ? 'docker' : 'subprocess');

    console.log('');
    console.log(bold(`  Running: ${cyan(file)}`));
    console.log(dim(`  Language: ${lang}  Runtime: ${runtime}`));

    if (!opts.fix) {
      const result = await runInSandbox({ code, language: lang, runtime });
      const output = formatSandboxResult(result);
      console.log('');
      console.log(dim('  ── Output ────────────────────────────────────'));
      console.log(output.split('\n').map((l) => `  ${l}`).join('\n'));
      console.log('');

      if (result.exitCode !== 0 || result.timedOut) {
        console.log(red(`  ✗ Failed (exit ${result.exitCode})`));
        console.log(dim('  Tip: use --fix to enable LLM auto-fix loop'));
      } else {
        console.log(green('  ✓ Success'));
      }
      return;
    }

    const config = await loadConfig();
    let provider;
    try {
      provider = buildProvider(config);
    } catch (err) {
      console.error(red(`  Error: ${(err as Error).message}`));
      Deno.exit(1);
    }

    const activeConfig = config.providers[config.defaultProvider]!;

    console.log(dim(`  Auto-fix enabled (max ${opts.maxFix} rounds)\n`));

    const result = await autofix({
      code,
      language: lang,
      provider: provider!,
      model: activeConfig.model,
      maxRounds: opts.maxFix,
      reasoningEffort: activeConfig.reasoningEffort,
      onProgress: (round, runResult, fixedCode) => {
        const status = runResult.exitCode === 0 && !runResult.timedOut ? green('✓') : red('✗');
        console.log(
          `  Round ${round}: ${status} exit ${runResult.exitCode} · ${runResult.durationMs}ms`,
        );
        if (runResult.stdout.trim()) {
          console.log(
            dim(runResult.stdout.trimEnd().split('\n').map((l) => `    ${l}`).join('\n')),
          );
        }
        if (runResult.stderr.trim() && runResult.exitCode !== 0) {
          console.log(
            red(runResult.stderr.trim().split('\n').slice(0, 5).map((l) => `    ${l}`).join('\n')),
          );
        }
        if (fixedCode) {
          console.log(yellow(`  → LLM proposed fix (${fixedCode.length} chars)`));
        }
      },
    });

    console.log('');
    if (result.success) {
      console.log(green(`  ✓ Succeeded after ${result.rounds} round(s)`));
      if (result.rounds > 1) {
        console.log(dim(`\n  Final code:\n`));
        result.finalCode.split('\n').forEach((l) => console.log(dim(`  ${l}`)));
      }
    } else {
      console.log(red(`  ✗ Still failing after ${result.rounds} round(s)`));
      console.log(dim('  Final error:'));
      console.log(red(`  ${result.finalResult.stderr.trim().slice(0, 300)}`));
    }
  });

function inferLang(file: string): string {
  const ext = file.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    py: 'python',
    js: 'javascript',
    ts: 'typescript',
    sh: 'bash',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
  };
  return map[ext] ?? 'bash';
}
