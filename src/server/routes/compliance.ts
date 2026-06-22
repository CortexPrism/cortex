import { json, notFound, type RouteHandler } from './_helpers.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/compliance\/session\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/compliance\/session\/([^/]+)$/);
      if (!m) return notFound();
      const { getSessionCompliance } = await import('../../security/compliance.ts');
      const records = await getSessionCompliance(m[1]);
      return json(records);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/compliance\/risk$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const { getComplianceByRisk } = await import('../../security/compliance.ts');
      const level = (url.searchParams.get('level') ?? 'high') as
        | 'low'
        | 'medium'
        | 'high'
        | 'critical';
      const since = url.searchParams.get('since') ?? undefined;
      const records = await getComplianceByRisk(level, since);
      return json(records);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/compliance\/export$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const { exportComplianceReport } = await import('../../security/compliance.ts');
      const framework = (url.searchParams.get('framework') ?? 'EU AI Act') as
        | 'EU AI Act'
        | 'GDPR'
        | 'ISO 42001'
        | 'SOC2'
        | 'HIPAA'
        | 'PCI DSS';
      const since = url.searchParams.get('since') ?? undefined;
      const report = await exportComplianceReport(framework, since);
      return json(report);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/compliance\/retention$/,
    handler: async () => {
      const { enforceRetention } = await import('../../security/compliance.ts');
      const deleted = await enforceRetention();
      return json({ ok: true, deleted });
    },
  },
];
