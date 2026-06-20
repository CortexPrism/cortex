import { Command } from '@cliffy/command';
import { bold, cyan, green, red, yellow } from '@std/fmt/colors';
import { loadConfig } from '../config/config.ts';

export const agentlintCommand = new Command()
  .name('agentlint')
  .description('AgentLint — audit agent configs, tools, plugins, and prompts')
  .action(async () => {
    console.log('');
    console.log(bold('Cortex AgentLint'));
    console.log('');
    console.log(bold('Actions'));
    console.log(
      `  ${cyan('cortex agentlint check')}    — Run AgentLint checks on current agent config`,
    );
    console.log(
      `  ${cyan('cortex agentlint config')}   — Verbose lint report with provider/model details`,
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
      tools: Object.keys(config.agents?.['default'] ?? {}),
      maxTurns: config.agent.maxTurns,
      provider: config.defaultProvider,
      model: config.providers[config.defaultProvider]?.model ?? 'unknown',
    };

    const report = lintAgentConfig(agentConfig);

    if (report.passed) {
      console.log(green(`✓ ${agentConfig.name}: all ${report.totalChecks} checks passed`));
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
    console.log(red(`✗ ${report.errorCount} error(s), ${report.warningCount} warning(s)`));
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
      tools: Object.keys(config.agents?.['default'] ?? {}),
      maxTurns: config.agent.maxTurns,
      provider: config.defaultProvider,
      model: config.providers[config.defaultProvider]?.model ?? 'unknown',
    };

    console.log(bold(`\nLinting agent: ${agentConfig.name}`));
    console.log(`Provider: ${agentConfig.provider}, Model: ${agentConfig.model}\n`);

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
  console.log(`Total checks: ${report.totalChecks}`);
  console.log(`  ${green(`Passed: ${report.passCount}`)}`);
  if (report.warningCount > 0) console.log(`  ${yellow(`Warnings: ${report.warningCount}`)}`);
  if (report.errorCount > 0) console.log(`  ${red(`Errors: ${report.errorCount}`)}`);
  console.log(`  Info: ${report.infoCount}`);
  console.log('');

  if (report.passed) {
    console.log(green('✓ All checks passed\n'));
    return;
  }

  console.log(bold('Issues:'));
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
