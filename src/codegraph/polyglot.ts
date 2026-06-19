/**
 * Polyglot Bridge: cross-language AST normalization — #84
 *
 * Provides a shared AST node taxonomy and cross-language call tracing,
 * enabling the code graph to link caller/callee relationships across
 * different programming languages (e.g., Python calling a Go service,
 * TypeScript calling a Rust library).
 */

import type { CodeEdge, CodeNode, CodeNodeLabel } from './schema.ts';
import { EXTENSION_LANG_MAP } from './schema.ts';

/** Canonical AST node kinds independent of source language */
export const POLYGLOT_NODE_KINDS = [
  'function',
  'method',
  'class',
  'interface',
  'enum',
  'type_alias',
  'variable',
  'constant',
  'module',
  'route',
  'middleware',
  'service',
  'data_model',
  'event_handler',
  'config_block',
] as const;

export type PolyglotNodeKind = typeof POLYGLOT_NODE_KINDS[number];

/** Mapping from tree-sitter node types to polyglot node kinds */
const TYPE_TO_POLYGLOT: Record<string, PolyglotNodeKind> = {
  function_declaration: 'function',
  function_definition: 'function',
  method_definition: 'method',
  class_declaration: 'class',
  interface_declaration: 'interface',
  enum_declaration: 'enum',
  type_alias_declaration: 'type_alias',
  variable_declaration: 'variable',
  lexical_declaration: 'variable',
  const_declaration: 'constant',
  route_declaration: 'route',
  service_declaration: 'service',
};

/** Mapping from CodeNodeLabel to polyglot kind */
const LABEL_TO_POLYGLOT: Record<string, PolyglotNodeKind> = {
  CodeFunction: 'function',
  CodeMethod: 'method',
  CodeClass: 'class',
  CodeInterface: 'interface',
  CodeEnum: 'enum',
  CodeType: 'type_alias',
  CodeModule: 'module',
  CodeRoute: 'route',
  CodePackage: 'module',
  CodeFile: 'module',
};

/** Mapping from polyglot kind to canonical label */
const POLYGLOT_TO_LABEL: Record<PolyglotNodeKind, CodeNodeLabel> = {
  function: 'CodeFunction',
  method: 'CodeMethod',
  class: 'CodeClass',
  interface: 'CodeInterface',
  enum: 'CodeEnum',
  type_alias: 'CodeType',
  variable: 'CodeType',
  constant: 'CodeType',
  module: 'CodeModule',
  route: 'CodeRoute',
  middleware: 'CodeRoute',
  service: 'CodeResource',
  data_model: 'CodeType',
  event_handler: 'CodeFunction',
  config_block: 'CodeResource',
};

export interface NormalizedNode {
  name: string;
  qualifiedName: string;
  kind: PolyglotNodeKind;
  language: string;
  signature: string | null;
  complexity: number;
  sourceNode: CodeNode | null;
}

export interface CrossLanguageTrace {
  path: NormalizedNode[];
  languageHops: number;
  confidence: number;
}

/**
 * Normalize a CodeNode into the polyglot taxonomy
 */
export function normalizeCodeNode(node: CodeNode): NormalizedNode {
  const kind = LABEL_TO_POLYGLOT[node.label] ?? 'function';
  return {
    name: node.name,
    qualifiedName: node.qualified_name,
    kind,
    language: node.language ?? 'unknown',
    signature: node.signature,
    complexity: node.complexity,
    sourceNode: node,
  };
}

/**
 * Normalize a tree-sitter node type to polyglot kind
 */
export function normalizeNodeType(nodeType: string): PolyglotNodeKind {
  return TYPE_TO_POLYGLOT[nodeType] ?? 'function';
}

/**
 * Convert polyglot kind back to CodeNodeLabel for graph storage
 */
export function polyglotKindToLabel(kind: PolyglotNodeKind): CodeNodeLabel {
  return POLYGLOT_TO_LABEL[kind];
}

/**
 * Detect language from file extension
 */
export function detectLanguage(filePath: string): string | null {
  const ext = '.' + (filePath.split('.').pop()?.toLowerCase() ?? '');
  return EXTENSION_LANG_MAP[ext] ?? null;
}

/**
 * Build a cross-language trace by joining normalized paths
 * from different projects/languages into a unified call chain.
 */
export function buildCrossLanguageTrace(
  segments: NormalizedNode[][],
): CrossLanguageTrace {
  const uniqueLangs = new Set<string>();
  const path: NormalizedNode[] = [];

  for (const segment of segments) {
    for (const node of segment) {
      uniqueLangs.add(node.language);
      if (!path.some((p) => p.qualifiedName === node.qualifiedName)) {
        path.push(node);
      }
    }
  }

  return {
    path,
    languageHops: Math.max(0, uniqueLangs.size - 1),
    confidence: path.length > 0 ? Math.min(1, segments.length / (path.length + 1)) : 0,
  };
}

/**
 * Group normalized nodes by language
 */
export function groupByLanguage(nodes: NormalizedNode[]): Record<string, NormalizedNode[]> {
  const groups: Record<string, NormalizedNode[]> = {};
  for (const node of nodes) {
    const lang = node.language || 'unknown';
    if (!groups[lang]) groups[lang] = [];
    groups[lang].push(node);
  }
  return groups;
}

/**
 * Get cross-language FFI/binding hints from node metadata
 */
export function detectFFIBridges(nodes: NormalizedNode[]): Array<{
  source: NormalizedNode;
  target: NormalizedNode;
  kind: string;
}> {
  const bridges: Array<{ source: NormalizedNode; target: NormalizedNode; kind: string }> = [];
  const ffiKeywords = ['ffi', 'cgo', 'jni', 'ctypes', 'bindgen', 'swig', 'pyo3', 'napi'];

  for (const node of nodes) {
    if (!node.signature) continue;
    const lower = node.signature.toLowerCase();
    for (const kw of ffiKeywords) {
      if (lower.includes(kw)) {
        bridges.push({
          source: node,
          target: {
            name: kw,
            qualifiedName: `ffi:${kw}`,
            kind: 'service',
            language: 'native',
            signature: null,
            complexity: 0,
            sourceNode: null,
          },
          kind: `ffi_${kw}`,
        });
      }
    }
  }
  return bridges;
}

/**
 * Check if two nodes are in the same language family
 */
export function isSameLanguageFamily(lang1: string, lang2: string): boolean {
  const families: Record<string, string[]> = {
    'c-family': ['c', 'cpp', 'c_sharp', 'objective-c'],
    'js-family': ['typescript', 'javascript', 'tsx', 'jsx'],
    'jvm-family': ['java', 'kotlin', 'scala'],
    'scripting': ['python', 'ruby', 'php', 'lua'],
    'systems': ['rust', 'go', 'zig', 'nim'],
  };
  for (const [, members] of Object.entries(families)) {
    if (members.includes(lang1) && members.includes(lang2)) return true;
  }
  return lang1 === lang2;
}
