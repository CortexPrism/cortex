/**
 * Plugin dependency resolver — validates and orders plugin dependencies
 * using topological sort with version constraint checking.
 */
import type { PluginManifest } from './types.ts';

// ── Types ────────────────────────────────────────────────────

export interface DepResult {
  /** Ordered list of plugin manifests in install order. */
  order: PluginManifest[];
  /** Unresolved dependencies that couldn't be satisfied. */
  missing: Array<{ plugin: string; requires: string; version: string }>;
  /** Circular dependency chain detected, if any. */
  cycle?: string[];
  /** Whether resolution succeeded without issues. */
  ok: boolean;
}

interface DepNode {
  name: string;
  version: string;
  manifest: PluginManifest;
  resolved: boolean;
  visiting: boolean;
  edges: DepEdge[];
}

interface DepEdge {
  from: string;
  to: string;
  constraint: string;
}

// ── Version Comparison ───────────────────────────────────────

/** Simple semver comparator. Supports ^, ~, >=, >, <=, <, =, x-ranges. */
function versionSatisfies(actual: string, constraint: string): boolean {
  const c = constraint.trim();

  // Exact match
  if (/^\d+\.\d+\.\d+$/.test(c)) return actual === c;

  // ^x.y.z — compatible with major version
  if (c.startsWith('^')) {
    const v = c.slice(1);
    const [aMaj, aMin] = actual.split('.').map(Number);
    const [cMaj, cMin] = v.split('.').map(Number);
    if (aMaj !== cMaj) return false;
    if (aMin < cMin) return false;
    return true;
  }

  // ~x.y.z — compatible with minor version
  if (c.startsWith('~')) {
    const v = c.slice(1);
    const parts = actual.split('.').map(Number);
    const cParts = v.split('.').map(Number);
    if (parts[0] !== cParts[0]) return false;
    if (parts.length > 1 && cParts.length > 1 && parts[1] < cParts[1]) return false;
    return true;
  }

  // >=, >, <=, <
  const cmpMatch = c.match(/^(>=|>|<=|<)\s*(\d+\.\d+\.\d+)$/);
  if (cmpMatch) {
    const op = cmpMatch[1];
    const v = cmpMatch[2];
    const cmp = semverCmp(actual, v);
    switch (op) {
      case '>=':
        return cmp >= 0;
      case '>':
        return cmp > 0;
      case '<=':
        return cmp <= 0;
      case '<':
        return cmp < 0;
    }
  }

  // * or x — any version
  if (c === '*' || c === 'x' || c === 'latest') return true;

  // x.y.* — match major.minor
  const starMatch = c.match(/^(\d+)\.(\d+)\.\*$/);
  if (starMatch) {
    const parts = actual.split('.').map(Number);
    return parts[0] === Number(starMatch[1]) && parts[1] === Number(starMatch[2]);
  }

  return false;
}

/** Compare two semver strings: returns -1, 0, 1. */
function semverCmp(a: string, b: string): number {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((aParts[i] || 0) < (bParts[i] || 0)) return -1;
    if ((aParts[i] || 0) > (bParts[i] || 0)) return 1;
  }
  return 0;
}

// ── Resolution ───────────────────────────────────────────────

/**
 * Resolve plugin dependencies. Takes a list of plugin manifests (including
 * all available installed plugins) and the manifest of the plugin being
 * installed. Returns an install order with dependency validation.
 */
export function resolveDependencies(
  toInstall: PluginManifest,
  installed: PluginManifest[],
): DepResult {
  const allManifests = [toInstall, ...installed];
  const nameMap = new Map<string, PluginManifest[]>();
  for (const m of allManifests) {
    const list = nameMap.get(m.name) || [];
    list.push(m);
    nameMap.set(m.name, list);
  }

  const nodes = new Map<string, DepNode>();
  const missing: DepResult['missing'] = [];

  function getNode(name: string, version: string): DepNode | null {
    const list = nameMap.get(name);
    if (!list) return null;
    // Find the best matching version
    for (const m of list) {
      if (!version || versionSatisfies(m.version, version)) {
        return {
          name: m.name,
          version: m.version,
          manifest: m,
          resolved: false,
          visiting: false,
          edges: [],
        };
      }
    }
    return null;
  }

  // Build dependency graph
  for (const m of allManifests) {
    let node = nodes.get(m.name);
    if (!node) {
      node = {
        name: m.name,
        version: m.version,
        manifest: m,
        resolved: false,
        visiting: false,
        edges: [],
      };
      nodes.set(m.name, node);
    }

    if (m.dependencies) {
      for (const [depName, constraint] of Object.entries(m.dependencies)) {
        const dep = getNode(depName, constraint);
        if (dep) {
          node.edges.push({ from: m.name, to: dep.name, constraint });
          // Ensure dep node exists
          if (!nodes.has(dep.name)) nodes.set(dep.name, dep);
        } else {
          missing.push({ plugin: m.name, requires: depName, version: constraint });
        }
      }
    }
  }

  // Topological sort (DFS)
  const order: PluginManifest[] = [];
  const cyclePath: string[] = [];

  function visit(name: string): boolean {
    const node = nodes.get(name);
    if (!node) return true;
    if (node.resolved) return true;
    if (node.visiting) {
      cyclePath.push(name);
      return false;
    }

    node.visiting = true;
    for (const edge of node.edges) {
      if (!visit(edge.to)) {
        cyclePath.push(name);
        return false;
      }
    }
    node.visiting = false;
    node.resolved = true;
    order.push(node.manifest);
    return true;
  }

  const start = nodes.get(toInstall.name);
  if (start && !visit(start.name)) {
    return { order: [], missing, cycle: cyclePath, ok: false };
  }

  // Visit remaining unresolved nodes
  for (const [name] of nodes) {
    if (!visit(name)) {
      return { order: [], missing, cycle: cyclePath, ok: false };
    }
  }

  return { order, missing, ok: missing.length === 0 };
}

/** Check if an installed plugin satisfies a dependency constraint. */
export function checkDependency(
  name: string,
  constraint: string,
  installed: PluginManifest[],
): PluginManifest | null {
  const candidates = installed.filter((m) => m.name === name);
  for (const c of candidates) {
    if (versionSatisfies(c.version, constraint)) return c;
  }
  return null;
}

/** List all transitive dependencies of a plugin. */
export function getTransitiveDeps(
  manifest: PluginManifest,
  installed: PluginManifest[],
): PluginManifest[] {
  const result: PluginManifest[] = [];
  const seen = new Set<string>();

  function walk(name: string, constraint: string): void {
    const found = checkDependency(name, constraint, installed);
    if (!found || seen.has(found.name)) return;
    seen.add(found.name);
    result.push(found);
    if (found.dependencies) {
      for (const [depName, depConstraint] of Object.entries(found.dependencies)) {
        walk(depName, depConstraint);
      }
    }
  }

  if (manifest.dependencies) {
    for (const [name, constraint] of Object.entries(manifest.dependencies)) {
      walk(name, constraint);
    }
  }

  return result;
}
