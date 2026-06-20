import { Command } from '@cliffy/command';
import {
  enforceRetention,
  exportComplianceReport,
  getComplianceByRisk,
  getSessionCompliance,
  type RegulatoryFramework,
  type RiskLevel,
} from '../security/compliance.ts';
import { i18n } from '../i18n/service.ts';

function riskLabel(level: RiskLevel): string {
  return level.toUpperCase();
}

function pad(str: string, len: number): string {
  return str.padEnd(len).slice(0, len);
}

export const complianceCommand = new Command()
  .name('compliance')
  .description('View and export EU AI Act / ISO 42001 compliance metadata')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    const records = await getComplianceByRisk('medium');
    if (records.length === 0) {
      console.log(i18n.t('cli.compliance.noRecords'));
      return;
    }

    if (opts.json) {
      console.log(JSON.stringify(records, null, 2));
      return;
    }

    console.log(i18n.t('cli.compliance.recordsFound', { count: String(records.length) }));
    for (const r of records.slice(0, 50)) {
      console.log(
        `  ${pad(r.id.slice(0, 14), 14)} ${riskLabel(r.riskLevel).padEnd(8)} ` +
          `${r.dataCategories.join(', ') || '—'}`,
      );
    }
    if (records.length > 50) {
      console.log(i18n.t('cli.compliance.moreRecords', { count: String(records.length - 50) }));
    }
    console.log(i18n.t('cli.compliance.useJsonHint'));
  })
  .command('session')
  .arguments('<sessionId:string>')
  .description('Show compliance records for a session')
  .option('--json', 'Output as JSON')
  .action(async (opts, sessionId: string) => {
    const records = await getSessionCompliance(sessionId);
    if (records.length === 0) {
      console.log(i18n.t('cli.compliance.noSessionRecords', { sessionId }));
      return;
    }

    if (opts.json) {
      console.log(JSON.stringify(records, null, 2));
      return;
    }

    console.log(`\nSession: ${sessionId}\n`);
    for (const r of records) {
      const turn = r.turnId ? r.turnId.slice(0, 14) : '(session)';
      console.log(
        `  ${pad(turn, 16)} ${riskLabel(r.riskLevel).padEnd(8)} ` +
          `${r.dataCategories.join(', ') || '—'}`,
      );
    }
    console.log(i18n.t('cli.compliance.sessionRecordsCount', { count: String(records.length) }));
  })
  .command('export')
  .description('Export compliance report for a regulatory framework')
  .option('-f, --framework <framework:string>', 'Regulatory framework', { default: 'EU AI Act' })
  .option('-s, --since <date:string>', 'Filter records since date (ISO 8601)')
  .option('-o, --output <file:string>', 'Write report to file')
  .action(async (opts) => {
    const report = await exportComplianceReport(
      (opts.framework as RegulatoryFramework) || 'EU AI Act',
      opts.since,
    );

    const output = JSON.stringify(report, null, 2);

    if (opts.output) {
      await Deno.writeTextFile(opts.output, output);
      console.log(i18n.t('cli.compliance.reportWritten', { file: opts.output }));
      console.log(
        i18n.t('cli.compliance.reportSummary', {
          records: String(report.records.length),
          sessions: String(report.summary.totalSessions),
        }),
      );
    } else {
      console.log(output);
    }
  })
  .command('risk')
  .arguments('<level:string>')
  .description('Show records at or above a risk level (low, medium, high, critical)')
  .option('--since <date:string>', 'Filter records since date')
  .option('--json', 'Output as JSON')
  .action(async (opts, level: string) => {
    const levels = ['low', 'medium', 'high', 'critical'];
    if (!levels.includes(level)) {
      console.log(i18n.t('cli.compliance.invalidRiskLevel', { level, levels: levels.join(', ') }));
      return;
    }

    const records = await getComplianceByRisk(level as RiskLevel, opts.since);

    if (opts.json) {
      console.log(JSON.stringify(records, null, 2));
      return;
    }

    console.log(
      i18n.t('cli.compliance.recordsAtRisk', {
        count: String(records.length),
        risk: riskLabel(level as RiskLevel),
      }),
    );

    for (const r of records.slice(0, 50)) {
      console.log(
        `  ${pad(r.id.slice(0, 14), 14)} ${riskLabel(r.riskLevel).padEnd(8)} ` +
          `${r.dataCategories.join(', ') || '—'}  ${r.createdAt.slice(0, 19).replace('T', ' ')}`,
      );
    }
    if (records.length > 50) console.log(`  ... and ${records.length - 50} more`);
  })
  .command('retention')
  .description('Enforce data retention policy (delete expired records)')
  .action(async () => {
    const deleted = await enforceRetention();
    console.log(i18n.t('cli.compliance.retentionEnforced', { deleted: String(deleted) }));
  });
