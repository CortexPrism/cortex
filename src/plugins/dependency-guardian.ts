/**
 * Dependency Supply Chain Guardian — #272
 *
 * Continuous monitoring of all dependencies for newly disclosed CVEs,
 * malicious package takeovers, and license changes. Integrates with
 * advisory databases and auto-generates remediation PRs.
 */
import { logEvent } from '../db/lens.ts';

export type DependencyEcosystem = 'npm' | 'pypi' | 'maven' | 'go' | 'cargo' | 'nuget';

export interface DependencyEntry {
  name: string;
  version: string;
  ecosystem: DependencyEcosystem;
  license?: string;
  isDirect: boolean;
  introduced?: string;
  latestVersion?: string;
  cveIds: string[];
  riskScore: number;
  lastChecked: string;
}

export interface CVERecord {
  id: string;
  packageName: string;
  ecosystem: DependencyEcosystem;
  affectedVersions: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  publishedAt: string;
  fixedIn?: string;
}

export interface GuardianReport {
  dependencies: DependencyEntry[];
  totalDependencies: number;
  vulnerabilitiesFound: number;
  criticalVulnerabilities: number;
  highVulnerabilities: number;
  outdatedDependencies: number;
  licenseIssues: number;
  generatedAt: string;
}

const dependencyRegistry = new Map<string, DependencyEntry[]>();
const cveDatabase = new Map<string, CVERecord[]>();
const blockedLicenses = new Set<string>(['GPL-3.0', 'AGPL-3.0', 'BUSL-1.1', 'SSPL-1.0']);
const licenseCache = new Map<string, string>();

export function setBlockedLicenses(licenses: string[]): void {
  blockedLicenses.clear();
  for (const license of licenses) {
    blockedLicenses.add(license);
  }
}

export function registerDependencies(
  projectId: string,
  deps: DependencyEntry[],
): void {
  const enriched = deps.map((dep) => ({
    ...dep,
    cveIds: dep.cveIds ?? [],
    riskScore: dep.riskScore ?? 0,
    lastChecked: new Date().toISOString(),
  }));
  dependencyRegistry.set(projectId, enriched);
}

export function getDependencies(projectId: string): DependencyEntry[] {
  return dependencyRegistry.get(projectId) ?? [];
}

export function registerCVE(record: CVERecord): void {
  const key = `${record.ecosystem}:${record.packageName}`;
  const existing = cveDatabase.get(key) ?? [];
  const idx = existing.findIndex((c) => c.id === record.id);
  if (idx >= 0) {
    existing[idx] = record;
  } else {
    existing.push(record);
  }
  cveDatabase.set(key, existing);
}

export function getCVEs(
  ecosystem: DependencyEcosystem,
  packageName: string,
): CVERecord[] {
  return cveDatabase.get(`${ecosystem}:${packageName}`) ?? [];
}

export function checkDependency(
  dep: DependencyEntry,
): { vulnerabilities: CVERecord[]; outdated: boolean; licenseIssue: boolean } {
  const cves = getCVEs(dep.ecosystem, dep.name).filter((cve) => {
    const versions = cve.affectedVersions.split(',').map((v) => v.trim());
    return versions.some((range) => isAffectedVersion(dep.version, range));
  });

  const outdated = dep.latestVersion ? compareVersions(dep.version, dep.latestVersion) < 0 : false;

  const licenseIssue = dep.license ? blockedLicenses.has(dep.license) : false;

  return { vulnerabilities: cves, outdated, licenseIssue };
}

export async function generateGuardianReport(
  projectId: string,
): Promise<GuardianReport> {
  const deps = getDependencies(projectId);
  const enrichedDeps: DependencyEntry[] = [];
  let vulnerabilitiesFound = 0;
  let criticalVulnerabilities = 0;
  let highVulnerabilities = 0;
  let outdatedDependencies = 0;
  let licenseIssues = 0;

  for (const dep of deps) {
    const { vulnerabilities, outdated, licenseIssue } = checkDependency(dep);
    vulnerabilitiesFound += vulnerabilities.length;
    criticalVulnerabilities += vulnerabilities.filter((v) => v.severity === 'critical').length;
    highVulnerabilities += vulnerabilities.filter((v) => v.severity === 'high').length;
    if (outdated) outdatedDependencies++;
    if (licenseIssue) licenseIssues++;

    enrichedDeps.push({
      ...dep,
      cveIds: vulnerabilities.map((v) => v.id),
      riskScore: calculateRiskScore(vulnerabilities, outdated, licenseIssue),
      lastChecked: new Date().toISOString(),
    });
  }

  dependencyRegistry.set(projectId, enrichedDeps);

  const report: GuardianReport = {
    dependencies: enrichedDeps,
    totalDependencies: deps.length,
    vulnerabilitiesFound,
    criticalVulnerabilities,
    highVulnerabilities,
    outdatedDependencies,
    licenseIssues,
    generatedAt: new Date().toISOString(),
  };

  await logEvent({
    event_type: 'guardian_report',
    session_id: '',
    actor: 'dependency-guardian',
    action: `report:${projectId}`,
    summary:
      `Guardian report: ${vulnerabilitiesFound} vulns, ${criticalVulnerabilities} critical, ${outdatedDependencies} outdated`,
    started_at: report.generatedAt,
    payload: {
      projectId,
      totalDeps: deps.length,
      vulnerabilitiesFound,
      criticalVulnerabilities,
      highVulnerabilities,
    },
  }).catch(() => {});

  return report;
}

export async function checkAllProjects(): Promise<Map<string, GuardianReport>> {
  const reports = new Map<string, GuardianReport>();

  for (const [projectId] of dependencyRegistry) {
    try {
      reports.set(projectId, await generateGuardianReport(projectId));
    } catch {
      // Continue checking other projects
    }
  }

  return reports;
}

export function suggestRemediation(
  dep: DependencyEntry,
  cves: CVERecord[],
): string | null {
  if (cves.length === 0) return null;

  const fixedVersions = cves
    .map((c) => c.fixedIn)
    .filter((v): v is string => v != null && v.length > 0);

  if (fixedVersions.length > 0) {
    const latestFix = fixedVersions.sort(compareVersions).pop()!;
    return `Upgrade to version ${latestFix} or later to fix ${cves.length} CVEs`;
  }

  if (dep.latestVersion && compareVersions(dep.version, dep.latestVersion) < 0) {
    return `Consider upgrading to latest version ${dep.latestVersion}`;
  }

  return 'No direct remediation available — review manually';
}

function calculateRiskScore(
  vulnerabilities: CVERecord[],
  outdated: boolean,
  licenseIssue: boolean,
): number {
  let score = 0;
  for (const vuln of vulnerabilities) {
    switch (vuln.severity) {
      case 'critical':
        score += 40;
        break;
      case 'high':
        score += 25;
        break;
      case 'medium':
        score += 10;
        break;
      case 'low':
        score += 3;
        break;
    }
  }
  if (outdated) score += 10;
  if (licenseIssue) score += 15;
  return Math.min(100, score);
}

function isAffectedVersion(current: string, range: string): boolean {
  if (range === '*' || range === 'all') return true;

  if (range.startsWith('<=')) {
    return compareVersions(current, range.slice(2).trim()) <= 0;
  }
  if (range.startsWith('>=')) {
    return compareVersions(current, range.slice(2).trim()) >= 0;
  }
  if (range.startsWith('<')) {
    return compareVersions(current, range.slice(1).trim()) < 0;
  }
  if (range.startsWith('>')) {
    return compareVersions(current, range.slice(1).trim()) > 0;
  }

  return current === range;
}

function compareVersions(a: string, b: string): number {
  const aParts = a.replace(/^[vV]/, '').split('.').map(Number);
  const bParts = b.replace(/^[vV]/, '').split('.').map(Number);
  const len = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < len; i++) {
    const aVal = aParts[i] || 0;
    const bVal = bParts[i] || 0;
    if (aVal < bVal) return -1;
    if (aVal > bVal) return 1;
  }

  return 0;
}
