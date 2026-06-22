import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { bold, type cyan, dim, type green, red, type yellow } from '@std/fmt/colors';
import { buildProvider } from '../../../../src/llm/router.ts';
import { formatSandboxResult, isDockerAvailable, runInSandbox } from '../../../../src/sandbox/executor.ts';
import { autofix } from '../../../../src/sandbox/autofix.ts';
import { i18n } from '../../../../src/i18n/service.ts';

export const runCommand = cortexCommand('run')
  .description('Execute code in a sandbox with optional LLM auto-fix loop')
  .arguments('<file:string>')
  .option('-l, --lang <lang:string>', 'Language override (python, javascript, bash, typescript)')
  .option('--fix', 'Enable auto-fix loop on failure')
  .option('--max-fix <n:number>', 'Max fix rounds', { default: 4 })
  .option('--no-sandbox', 'Skip Docker, use subprocess directly')
  .option('--sandbox-debug', 'Enable sandbox debug logging')
  .needs('config')
  .needs('migrations')
  .action(async (opts: Record<string, unknown>, ctx: Ctx, file: string) => {
    if (opts.sandboxDebug) {
      const { setSandboxDebug } = await import('../../../../src/sandbox/logger.ts');
      setSandboxDebug(true);
    }
    const config = ctx.config!;

    const code = await Deno.readTextFile(file).catch(() => {
      console.error(red('  ' + i18n.t('cli.run.cannotReadFile', { file })));
      Deno.exit(1);
    });

    const lang = (opts.lang as string) ?? inferLang(file);
    const dockerAvail = await isDockerAvailable();
    const useSandbox = opts.sandbox !== false && dockerAvail;
    const runtime = useSandbox ? 'docker' as const : 'subprocess' as const;

    if (opts.fix) {
      const provider = buildProvider(config);
      const model = config.providers[config.defaultProvider]?.model ?? 'unknown';
      console.log(bold(i18n.t('cli.run.autofixing')));
      const result = await autofix({
        code: code!,
        language: lang,
        provider,
        model,
        maxRounds: (opts.maxFix as number) ?? 4,
      });
      console.log(formatSandboxResult(result.finalResult));
      return;
    }

    if (!useSandbox && !dockerAvail) {
      console.log(dim(i18n.t('cli.run.dockerNotAvailable')));
    }

    const result = await runInSandbox({
      code: code!,
      language: lang,
      runtime,
    });
    console.log(formatSandboxResult(result));
  });

function inferLang(file: string): string {
  const ext = file.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'py':
      return 'python';
    case 'js':
      return 'javascript';
    case 'ts':
      return 'typescript';
    case 'sh':
      return 'bash';
    default:
      return 'bash';
  }
}
