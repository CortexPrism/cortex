import { join } from '@std/path';
import { exists } from '@std/fs';
import { addPolicy, listPolicies } from './policy.ts';
import type { PolicyEffect, PolicyKind } from './policy.ts';

export interface CplRule {
  kind: PolicyKind;
  effect: PolicyEffect;
  pattern: string;
  reason?: string;
  priority?: number;
  paths?: string[];
  rateLimit?: { maxPerMinute: number };
  requireJustification?: boolean;
}

export interface CplFile {
  version: number;
  description?: string;
  rules: CplRule[];
}

const CPL_SEARCH_PATHS = [
  '.cortex/policy.yaml',
  '.cortex/policy.yml',
  'cortex-policy.yaml',
  'cortex-policy.yml',
];

function parseYamlPolicy(text: string): CplFile {
  const lines = text.split('\n');
  const result: CplFile = { version: 1, rules: [] };
  let inRules = false;
  let currentRule: Partial<CplRule> | null = null;
  let inPaths = false;

  const flush = () => {
    if (currentRule?.kind && currentRule?.effect && currentRule?.pattern) {
      result.rules.push(currentRule as CplRule);
    }
    currentRule = null;
    inPaths = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const stripped = line.trim();

    if (stripped.startsWith('#') || stripped === '') continue;

    if (stripped.startsWith('version:')) {
      result.version = parseInt(stripped.split(':')[1]?.trim() ?? '1');
      continue;
    }
    if (stripped.startsWith('description:')) {
      result.description = stripped.slice('description:'.length).trim().replace(/^["']|["']$/g, '');
      continue;
    }

    if (stripped === 'rules:') {
      inRules = true;
      continue;
    }
    if (!inRules) continue;

    if (stripped.startsWith('- kind:') || stripped.startsWith('-\n  kind:')) {
      flush();
      currentRule = {};
      currentRule.kind = stripped.split(':')[1]?.trim() as PolicyKind;
      continue;
    }
    if (stripped.startsWith('- ') && !currentRule) {
      flush();
      currentRule = {};
    }

    if (!currentRule) continue;

    if (stripped.startsWith('kind:')) {
      currentRule.kind = stripped.split(':')[1]?.trim() as PolicyKind;
    } else if (stripped.startsWith('effect:')) {
      currentRule.effect = stripped.split(':')[1]?.trim() as PolicyEffect;
    } else if (stripped.startsWith('pattern:')) {
      currentRule.pattern = stripped.slice('pattern:'.length).trim().replace(/^["']|["']$/g, '');
    } else if (stripped.startsWith('reason:')) {
      currentRule.reason = stripped.slice('reason:'.length).trim().replace(/^["']|["']$/g, '');
    } else if (stripped.startsWith('priority:')) {
      currentRule.priority = parseInt(stripped.split(':')[1]?.trim() ?? '100');
    } else if (stripped.startsWith('require_justification:')) {
      currentRule.requireJustification = stripped.includes('true');
    } else if (stripped === 'paths:') {
      inPaths = true;
      currentRule.paths = [];
    } else if (inPaths && stripped.startsWith('- ')) {
      currentRule.paths!.push(stripped.slice(2).replace(/^["']|["']$/g, ''));
    } else inPaths = false;
  }

  flush();
  return result;
}

export async function loadCplFile(filePath: string): Promise<CplFile | null> {
  try {
    const text = await Deno.readTextFile(filePath);
    return parseYamlPolicy(text);
  } catch {
    return null;
  }
}

export async function findCplFile(cwd = Deno.cwd()): Promise<string | null> {
  for (const rel of CPL_SEARCH_PATHS) {
    const abs = join(cwd, rel);
    if (await exists(abs)) return abs;
  }
  return null;
}

export async function importCplFile(
  filePath: string,
): Promise<{ imported: number; skipped: number }> {
  const cpl = await loadCplFile(filePath);
  if (!cpl) return { imported: 0, skipped: 0 };

  const existing = await listPolicies();
  const existingPatterns = new Set(existing.map((r) => `${r.kind}:${r.pattern}`));

  let imported = 0;
  let skipped = 0;

  for (const rule of cpl.rules) {
    const key = `${rule.kind}:${rule.pattern}`;
    if (existingPatterns.has(key)) {
      skipped++;
      continue;
    }

    let reason = rule.reason ?? '';
    if (rule.requireJustification) reason += ' [justification required]';
    if (rule.paths?.length) reason += ` [paths: ${rule.paths.join(', ')}]`;
    if (rule.rateLimit) reason += ` [rate: ${rule.rateLimit.maxPerMinute}/min]`;

    await addPolicy({
      kind: rule.kind,
      effect: rule.effect,
      pattern: rule.pattern,
      reason: reason.trim() || undefined,
      priority: rule.priority,
    });
    imported++;
  }

  return { imported, skipped };
}

export async function autoLoadCpl(): Promise<void> {
  const path = await findCplFile();
  if (!path) return;
  const { imported } = await importCplFile(path);
  if (imported > 0) {
    console.log(`[policy] Loaded ${imported} rules from ${path}`);
  }
}

export function generateCplTemplate(): string {
  return `version: 1
description: "Cortex Policy Language — base security rules"

rules:
  - kind: shell
    effect: deny
    pattern: "rm\\s+-rf"
    reason: "Prevent recursive deletions"
    priority: 1

  - kind: shell
    effect: deny
    pattern: "(sudo|su)\\s"
    reason: "No privilege escalation"
    priority: 2

  - kind: domain
    effect: deny
    pattern: "localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0"
    reason: "Deny loopback access from agent"
    priority: 10

  - kind: tool
    effect: allow
    pattern: ".*"
    reason: "Default allow all tools"
    priority: 1000
`;
}
