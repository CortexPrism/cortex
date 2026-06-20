import type { CodeNodeLabel } from './schema.ts';
import { EXTENSION_LANG_MAP } from './schema.ts';

export interface ExtractedNode {
  label: CodeNodeLabel;
  name: string;
  qualifiedName: string;
  filePath: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  signature: string | null;
  returnType: string | null;
  language: string | null;
  isExported: boolean;
  complexity: number;
  decorators: string | null;
  metadata: Record<string, unknown>;
}

export interface ExtractedEdge {
  type: string;
  sourceQName: string;
  targetQName: string;
  confidence: number;
  callLine: number | null;
  argToParam: string | null;
  metadata: Record<string, unknown>;
}

export interface FileParseResult {
  filePath: string;
  language: string;
  nodes: ExtractedNode[];
  edges: ExtractedEdge[];
  error?: string;
}

interface TreeSitterParser {
  setLanguage(lang: unknown): void;
  parse(source: string, previousTree?: unknown): unknown;
}

interface TreeSitterTree {
  rootNode: TreeSitterNode;
}

interface TreeSitterNode {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  children: TreeSitterNode[];
  namedChildren: TreeSitterNode[];
  childForFieldName?(name: string): TreeSitterNode | null;
  child(index: number): TreeSitterNode | null;
  namedChild(index: number): TreeSitterNode | null;
}

interface TreeSitterLanguage {
  query(source: string): unknown;
}

interface TreeSitterQuery {
  captures(node: TreeSitterNode): Array<{ name: string; node: TreeSitterNode }>;
}

let _parser: TreeSitterParser | null = null;
let _Language: TreeSitterLanguage | null = null;
const _languageCache = new Map<string, TreeSitterLanguage>();

async function getParser(): Promise<TreeSitterParser> {
  if (_parser) return _parser;

  const mod = await import('npm:web-tree-sitter');
  await (mod as any).default.init();
  _Language = (mod as any).default.Language as TreeSitterLanguage;
  _parser = new ((mod as any).default)() as TreeSitterParser;
  return _parser;
}

const MAX_GRAMMAR_SIZE = 5 * 1024 * 1024;

async function loadLanguage(langName: string): Promise<TreeSitterLanguage | null> {
  if (_languageCache.has(langName)) return _languageCache.get(langName)!;

  const grammarPaths: Record<string, string> = {
    'typescript':
      'https://cdn.jsdelivr.net/npm/tree-sitter-typescript@0.23.2/tree-sitter-typescript.wasm',
    'tsx': 'https://cdn.jsdelivr.net/npm/tree-sitter-typescript@0.23.2/tree-sitter-tsx.wasm',
    'javascript':
      'https://cdn.jsdelivr.net/npm/tree-sitter-javascript@0.23.1/tree-sitter-javascript.wasm',
    'python': 'https://cdn.jsdelivr.net/npm/tree-sitter-python@0.23.6/tree-sitter-python.wasm',
    'go': 'https://cdn.jsdelivr.net/npm/tree-sitter-go@0.23.4/tree-sitter-go.wasm',
    'rust': 'https://cdn.jsdelivr.net/npm/tree-sitter-rust@0.23.2/tree-sitter-rust.wasm',
    'java': 'https://cdn.jsdelivr.net/npm/tree-sitter-java@0.23.5/tree-sitter-java.wasm',
    'cpp': 'https://cdn.jsdelivr.net/npm/tree-sitter-cpp@0.23.4/tree-sitter-cpp.wasm',
    'c': 'https://cdn.jsdelivr.net/npm/tree-sitter-c@0.24.0/tree-sitter-c.wasm',
    'c_sharp':
      'https://cdn.jsdelivr.net/npm/tree-sitter-c-sharp@0.23.1/tree-sitter-c_sharp.wasm',
    'php': 'https://cdn.jsdelivr.net/npm/tree-sitter-php@0.23.12/tree-sitter-php.wasm',
    'ruby': 'https://cdn.jsdelivr.net/npm/tree-sitter-ruby@0.23.1/tree-sitter-ruby.wasm',
  };

  const url = grammarPaths[langName];
  if (!url) { console.error('[codegraph] loadLanguage: no grammar URL for ' + langName); return null; }

  try {
    const response = await fetch(url);
    if (!response.ok) { console.error('[codegraph] loadLanguage: HTTP ' + response.status + ' for ' + langName + ' — ' + url); return null; }
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > MAX_GRAMMAR_SIZE) { console.error('[codegraph] loadLanguage: grammar too large for ' + langName + ' (' + contentLength + ' bytes)'); return null; }
    const wasmBytes = await response.arrayBuffer();
    if (wasmBytes.byteLength > MAX_GRAMMAR_SIZE) { console.error('[codegraph] loadLanguage: grammar too large for ' + langName + ' (' + wasmBytes.byteLength + ' bytes)'); return null; }

    const parser = await getParser();
    const lang = await (_Language as any).load(
      new Uint8Array(wasmBytes),
    ) as TreeSitterLanguage;
    if (!lang) { console.error('[codegraph] loadLanguage: Language.load returned null for ' + langName); return null; }

    _languageCache.set(langName, lang);
    console.error('[codegraph] loadLanguage: loaded ' + langName + ' (' + wasmBytes.byteLength + ' bytes)');
    return lang;
  } catch (e) {
    console.error('[codegraph] loadLanguage: exception for ' + langName + ' — ' + (e as Error).message);
    return null;
  }
}

function detectLanguage(filePath: string): string | null {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  return EXTENSION_LANG_MAP[ext] ?? null;
}

function extractDefinitions(
  node: TreeSitterNode,
  source: string,
  filePath: string,
  language: string,
): ExtractedNode[] {
  const nodes: ExtractedNode[] = [];

  function walk(n: TreeSitterNode, parentName?: string): void {
    const label = nodeTypeToLabel(n.type, language);
    if (label) {
      const name = extractName(n, source, language);
      if (!name || name.length === 0 || name.length > 200) return;

      const isExported = isNodeExported(n, source, language);
      const meta = extractMetadata(n, source, language);
      const sig = buildSignature(n, source, language);
      nodes.push({
        label,
        name,
        qualifiedName: parentName ? `${parentName}.${name}` : `${filePath}:${name}`,
        filePath,
        lineStart: n.startPosition.row + 1,
        lineEnd: n.endPosition.row + 1,
        signature: sig || null,
        returnType: (meta.returnType as string) ?? null,
        language,
        isExported,
        complexity: estimateComplexity(n),
        decorators: Array.isArray(meta.decorators) && meta.decorators.length > 0
          ? JSON.stringify(meta.decorators)
          : null,
        metadata: meta,
      });
    }

    for (const child of n.namedChildren) {
      const childLabel = nodeTypeToLabel(child.type, language);
      walk(child, childLabel ? name : parentName);
    }
  }

  walk(node);
  return nodes;
}

function extractCalls(
  node: TreeSitterNode,
  source: string,
  filePath: string,
): ExtractedEdge[] {
  const edges: ExtractedEdge[] = [];
  const callPatterns = getCallPatterns();

  function walk(n: TreeSitterNode): void {
    for (const { nodeType, extractFn } of callPatterns) {
      if (n.type === nodeType) {
        const target = extractFn(n, source);
        if (target) {
          edges.push({
            type: 'CALLS',
            sourceQName: '',
            targetQName: target,
            confidence: 0.85,
            callLine: n.startPosition.row + 1,
            argToParam: null,
            metadata: {},
          });
        }
      }
    }
    for (const child of n.namedChildren) {
      walk(child);
    }
  }

  walk(node);
  return edges;
}

function extractImports(
  node: TreeSitterNode,
  source: string,
  filePath: string,
): ExtractedEdge[] {
  const edges: ExtractedEdge[] = [];

  function walk(n: TreeSitterNode): void {
    if (n.type === 'import_statement' || n.type === 'import_declaration') {
      const fromClause = n.childForFieldName?.('source');
      let modulePath = fromClause?.text?.replace(/^['"]|['"]$/g, '') ?? null;
      if (!modulePath && n.type === 'import_declaration') {
        const children = n.namedChildren.filter((c) =>
          c.type === 'scoped_identifier' || c.type === 'identifier'
        );
        if (children.length > 0) {
          modulePath = children.map((c) => c.text).join('::');
        }
      }
      if (modulePath) {
        edges.push({
          type: 'IMPORTS',
          sourceQName: `${filePath}`,
          targetQName: modulePath,
          confidence: 0.95,
          callLine: n.startPosition.row + 1,
          argToParam: null,
          metadata: { modulePath },
        });
      }
    }
    for (const child of n.namedChildren) {
      walk(child);
    }
  }

  walk(node);
  return edges;
}

function getCallPatterns(): Array<{
  nodeType: string;
  extractFn: (node: TreeSitterNode, source: string) => string | null;
}> {
  return [
    {
      nodeType: 'call_expression',
      extractFn: (n, src) => {
        const func = n.childForFieldName?.('function') ?? n.namedChild(0);
        if (!func) return null;
        return getQualifiedCallTarget(func);
      },
    },
    {
      nodeType: 'method_invocation',
      extractFn: (n) => {
        const name = n.childForFieldName?.('name');
        return name?.text ?? null;
      },
    },
    {
      nodeType: 'function_call',
      extractFn: (n) => {
        const name = n.childForFieldName?.('function');
        return name?.text ?? n.namedChild(0)?.text ?? null;
      },
    },
  ];
}

function getQualifiedCallTarget(node: TreeSitterNode): string {
  if (node.type === 'member_expression' || node.type === 'dot_expression') {
    const obj = node.childForFieldName?.('object') ?? node.namedChild(0);
    const prop = node.childForFieldName?.('property') ?? node.namedChild(1);
    const objPart = obj ? getQualifiedCallTarget(obj) : '';
    const propPart = prop?.text ?? '';
    return objPart ? `${objPart}.${propPart}` : propPart;
  }
  if (node.type === 'identifier' || node.type === 'simple_identifier') {
    return node.text;
  }
  return node.text;
}

function nodeTypeToLabel(type: string, language: string): CodeNodeLabel | null {
  switch (type) {
    case 'function_declaration':
    case 'function_definition':
    case 'function_item':
      return 'CodeFunction';
    case 'method_definition':
    case 'method_declaration':
      return 'CodeMethod';
    case 'class_declaration':
    case 'class_definition':
    case 'class_item':
      return 'CodeClass';
    case 'interface_declaration':
    case 'interface_item':
    case 'trait_item':
      return 'CodeInterface';
    case 'enum_declaration':
    case 'enum_item':
      return 'CodeEnum';
    case 'type_alias_declaration':
    case 'type_item':
      return 'CodeType';
    case 'arrow_function':
    case 'generator_function':
    case 'function_expression':
      return 'CodeFunction';
    default:
      return null;
  }
}

function extractName(node: TreeSitterNode, source: string, language: string): string | null {
  const nameField = node.childForFieldName?.('name');
  if (nameField) return nameField.text;

  const firstId = node.namedChildren.find((c) =>
    c.type === 'identifier' || c.type === 'simple_identifier'
  );
  if (firstId) return firstId.text;

  return null;
}

function isNodeExported(node: TreeSitterNode, source: string, language: string): boolean {
  const parent = findParent(node);
  if (parent?.type === 'export_statement' || parent?.type === 'export_default') return true;

  if (language === 'go') {
    const name = extractName(node, source, language);
    return name !== null && name[0] === name[0].toUpperCase();
  }

  if (language === 'rust') {
    return parent?.type === 'impl_item' ? false : parent?.type !== 'impl_item';
  }

  const child = node.namedChildren.find((c) =>
    c.type === 'visibility_modifier' || c.type === 'modifiers'
  );
  if (child) {
    const text = child.text.toLowerCase();
    return text.includes('public') || text.includes('export') || text.includes('pub');
  }

  return false;
}

function findParent(node: TreeSitterNode): TreeSitterNode | null {
  return (node as unknown as { parent?: TreeSitterNode }).parent ?? null;
}

function extractMetadata(
  node: TreeSitterNode,
  source: string,
  language: string,
): Record<string, unknown> {
  const meta: Record<string, unknown> = {};

  const params = node.childForFieldName?.('parameters');
  if (params) {
    meta.parameters = params.namedChildren
      .filter((c) => c.type.includes('parameter'))
      .map((p) => p.text)
      .slice(0, 20);
  }

  const returnType = node.childForFieldName?.('return_type') ??
    node.childForFieldName?.('returnType');
  if (returnType) {
    meta.returnType = returnType.text;
  }

  const body = node.childForFieldName?.('body');
  if (body) {
    meta.lineCount = (body.endPosition.row - body.startPosition.row) + 1;
  }

  const decorators: string[] = [];
  for (const child of node.namedChildren) {
    if (child.type === 'decorator' || child.type === 'attribute') {
      decorators.push(child.text);
    }
  }
  if (decorators.length > 0) meta.decorators = decorators;

  return meta;
}

function buildSignature(node: TreeSitterNode, source: string, language: string): string | null {
  const name = extractName(node, source, language);
  if (!name) return null;

  const params = node.childForFieldName?.('parameters');
  const returnType = node.childForFieldName?.('return_type') ??
    node.childForFieldName?.('returnType');

  const paramStr = params
    ? `(${
      params.namedChildren.filter((c) => c.type.includes('parameter')).map((p) => p.text).join(', ')
    })`
    : '()';
  const retStr = returnType ? `: ${returnType.text}` : '';

  return `${name}${paramStr}${retStr}`;
}

function estimateComplexity(node: TreeSitterNode): number {
  let count = 0;

  function walk(n: TreeSitterNode): void {
    const complexTypes = new Set([
      'if_statement',
      'if_expression',
      'for_statement',
      'for_in_statement',
      'while_statement',
      'loop_expression',
      'switch_statement',
      'switch_expression',
      'match_expression',
      'try_statement',
      'catch_clause',
      'throw_statement',
      'raise_statement',
      'return_statement',
      '&&',
      '||',
      'and',
      'or',
    ]);
    if (complexTypes.has(n.type)) count++;
    for (const child of n.namedChildren) walk(child);
  }

  walk(node);
  return Math.min(count, 255);
}

export async function parseFile(
  filePath: string,
  source: string,
): Promise<FileParseResult> {
  const language = detectLanguage(filePath);
  if (!language) {
    return { filePath, language: 'unknown', nodes: [], edges: [], error: 'Unsupported language' };
  }

  const lang = await loadLanguage(language);
  if (!lang) {
    return {
      filePath,
      language,
      nodes: [],
      edges: [],
      error: `Grammar not available for ${language}`,
    };
  }

  try {
    const parser = await getParser();
    parser.setLanguage(lang as unknown as never);
    const tree = parser.parse(source) as unknown as TreeSitterTree;
    const rootNode = tree.rootNode;

    const nodes = extractDefinitions(rootNode, source, filePath, language);
    const calls = extractCalls(rootNode, source, filePath);
    const imports = extractImports(rootNode, source, filePath);

    return {
      filePath,
      language,
      nodes,
      edges: [...calls, ...imports],
    };
  } catch (err) {
    return {
      filePath,
      language,
      nodes: [],
      edges: [],
      error: (err as Error).message,
    };
  }
}
