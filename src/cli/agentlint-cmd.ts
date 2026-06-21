import { Command } from '@cliffy/command';
import { bold, cyan, green, red, yellow } from '@std/fmt/colors';
import { loadConfig } from '../config/config.ts';
import { i18n } from '../i18n/service.ts';

export const agentlintCommand = new Command()
  .name('agentlint')
  .description('AgentLint — audit agent configs, tools, plugins, and prompts')
  .action(async () => {
    console.log('');
    console.log(bold('Cortex AgentLint'));
    console.log('');
    console.log(bold(i18n.t('cli.agentlint.actions')));
    console.log(
      `  ${cyan(i18n.t('cli.agentlint.checkCommand'))}`,
    );
    console.log(
      `  ${cyan(i18n.t('cli.agentlint.configCommand'))}`,
    );
    console.log('');
  });

agentlintCommand
  .command('check')
  .description('Quick lint check — prints issues only, exits 1 if errors found (CI-friendly)')
  .action(async () => {
    const { lintAgentConfig } = await import('../agent/agentlint.ts');
    const config = await loadConfig();

    const agentConfig = {
      name: config.agent.name,
      description: `${config.agent.name} agent via ${config.defaultProvider}`,
      systemPrompt: 'CortexPrism agent prompt',
      tools: Object.keys(config.agents?.['assistant'] ?? {}),
      maxTurns: config.agent.maxTurns,
      provider: config.defaultProvider,
      model: config.providers[config.defaultProvider]?.model ?? 'unknown',
    };

    const report = lintAgentConfig(agentConfig);

    if (report.passed) {
      console.log(
        green(
          i18n.t('cli.agentlint.allChecksPassed', {
            name: agentConfig.name,
            totalChecks: String(report.totalChecks),
          }),
        ),
      );
      Deno.exit(0);
    }

    for (const issue of report.issues) {
      const color = issue.severity === 'error' ? red : issue.severity === 'warning' ? yellow : cyan;
      console.log(
        `${color(`[${issue.severity.toUpperCase()}]`)} ${issue.category}: ${issue.message}`,
      );
      if (issue.suggestion) console.log(`  Fix: ${issue.suggestion}`);
    }
    console.log('');
    console.log(
      red(
        i18n.t('cli.agentlint.errorsAndWarnings', {
          errors: String(report.errorCount),
          warnings: String(report.warningCount),
        }),
      ),
    );
    Deno.exit(report.errorCount > 0 ? 1 : 0);
  });

agentlintCommand
  .command('config')
  .description('Lint current agent configuration from config file')
  .action(async () => {
    const { lintAgentConfig } = await import('../agent/agentlint.ts');
    const config = await loadConfig();

    const agentConfig = {
      name: config.agent.name,
      description: `${config.agent.name} agent via ${config.defaultProvider}`,
      systemPrompt: 'CortexPrism agent prompt',
      tools: Object.keys(config.agents?.['assistant'] ?? {}),
      maxTurns: config.agent.maxTurns,
      provider: config.defaultProvider,
      model: config.providers[config.defaultProvider]?.model ?? 'unknown',
    };

    console.log(bold(i18n.t('cli.agentlint.lintingAgent', { name: agentConfig.name })));
    console.log(
      i18n.t('cli.agentlint.providerModel', {
        provider: agentConfig.provider,
        model: agentConfig.model,
      }) + '\n',
    );

    const report = lintAgentConfig(agentConfig);
    printLintReport(report);
  });

function printLintReport(report: {
  errorCount: number;
  warningCount: number;
  infoCount: number;
  passCount: number;
  totalChecks: number;
  passed: boolean;
  issues: Array<
    { severity: string; category: string; message: string; source: string; suggestion?: string }
  >;
}): void {
  console.log(i18n.t('cli.agentlint.totalChecks', { count: String(report.totalChecks) }));
  console.log(`  ${green(i18n.t('cli.agentlint.passed', { count: String(report.passCount) }))}`);
  if (report.warningCount > 0) {
    console.log(
      `  ${yellow(i18n.t('cli.agentlint.warnings', { count: String(report.warningCount) }))}`,
    );
  }
  if (report.errorCount > 0) {
    console.log(`  ${red(i18n.t('cli.agentlint.errors', { count: String(report.errorCount) }))}`);
  }
  console.log(`  Info: ${report.infoCount}`);
  console.log('');

  if (report.passed) {
    console.log(green(i18n.t('cli.agentlint.allPassed') + '\n'));
    return;
  }

  console.log(bold(i18n.t('cli.agentlint.issues')));
  for (const issue of report.issues) {
    const color = issue.severity === 'error' ? red : issue.severity === 'warning' ? yellow : cyan;
    console.log(
      `  ${color(`[${issue.severity.toUpperCase()}]`)} ${issue.category}: ${issue.message}`,
    );
    console.log(`    Source: ${issue.source}`);
    if (issue.suggestion) console.log(`    ${green('Fix:')} ${issue.suggestion}`);
    console.log('');
  }
}
