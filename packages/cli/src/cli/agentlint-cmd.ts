import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { bold, cyan, dim, green, red, yellow } from '@std/fmt/colors';
import { i18n } from '../../../../src/i18n/service.ts';

const checkCmd = cortexCommand('check')
  .description('Lint a specific agent by ID, or the default agent if none given')
  .arguments('[agent-id:string]')
  .needs('config')
  .action(async (_opts: Record<string, unknown>, ctx: Ctx, agentId?: string) => {
    const { lintAgentConfig } = await import('../../../../src/agent/agentlint.ts');
    const config = ctx.config!;

    let agentConfig;
    if (agentId) {
      const { getAgent } = await import('../../../../src/agent/manager.ts');
      const agent = await getAgent(agentId);
      if (!agent) {
        console.error(red(`Agent "${agentId}" not found`));
        Deno.exit(1);
      }
      agentConfig = {
        name: agent.name,
        description: agent.description ?? `${agent.name} agent`,
        systemPrompt: agent.systemPrompt ?? '',
        tools: agent.tools ?? [],
        maxTurns: agent.maxTurns ?? config.agent.maxTurns,
        provider: agent.provider ?? config.defaultProvider,
        model: agent.model ?? config.providers[config.defaultProvider]?.model ?? 'unknown',
      };
      console.log(bold(`\n  Linting agent: ${agentConfig.name} (${agentId})`));
    } else {
      agentConfig = {
        name: config.agent.name,
        description: `${config.agent.name} agent via ${config.defaultProvider}`,
        systemPrompt: 'CortexPrism agent prompt',
        tools: Object.keys(config.agents?.['assistant'] ?? {}),
        maxTurns: config.agent.maxTurns,
        provider: config.defaultProvider,
        model: config.providers[config.defaultProvider]?.model ?? 'unknown',
      };
    }

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
      if (issue.suggestion) console.log(`  ${dim('Fix:')} ${issue.suggestion}`);
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

const configCmd = cortexCommand('config')
  .description('Lint current agent configuration from config file')
  .needs('config')
  .action(async (_opts: Record<string, unknown>, ctx: Ctx) => {
    const { lintAgentConfig } = await import('../../../../src/agent/agentlint.ts');
    const config = ctx.config!;

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

export const agentlintCommand = cortexCommand('agentlint')
  .description('AgentLint — audit agent configs, tools, plugins, and prompts')
  .command('check', checkCmd)
  .command('config', configCmd);
