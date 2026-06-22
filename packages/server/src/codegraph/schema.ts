export const CODE_NODE_LABELS = [
  'CodeProject',
  'CodePackage',
  'CodeFile',
  'CodeModule',
  'CodeFunction',
  'CodeMethod',
  'CodeClass',
  'CodeInterface',
  'CodeEnum',
  'CodeType',
  'CodeRoute',
  'CodeResource',
] as const;

export type CodeNodeLabel = typeof CODE_NODE_LABELS[number];

export const CODE_EDGE_TYPES = [
  'CALLS',
  'IMPORTS',
  'DEFINES',
  'DEFINES_METHOD',
  'IMPLEMENTS',
  'INHERITS',
  'HTTP_CALLS',
  'ASYNC_CALLS',
  'DECORATES',
  'USES_TYPE',
  'USAGE',
  'MEMBER_OF',
  'CONTAINS_PACKAGE',
  'CONTAINS_FILE',
  'HANDLES',
  'TESTS',
  'CONFIGURES',
  'DATA_FLOWS',
] as const;

export type CodeEdgeType = typeof CODE_EDGE_TYPES[number];

export interface CodeNode {
  id: number;
  project_id: number;
  label: CodeNodeLabel;
  name: string;
  qualified_name: string;
  file_path: string | null;
  line_start: number | null;
  line_end: number | null;
  signature: string | null;
  return_type: string | null;
  language: string | null;
  is_exported: boolean;
  complexity: number;
  decorators: string | null;
  metadata: string | null;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface CodeEdge {
  id: number;
  project_id: number;
  type: CodeEdgeType;
  source_id: number;
  target_id: number;
  confidence: number;
  call_line: number | null;
  arg_to_param: string | null;
  metadata: string | null;
  created_at: string;
}

export interface CodeProject {
  id: number;
  name: string;
  root_path: string;
  language_stats: string | null;
  node_count: number;
  edge_count: number;
  indexed_at: string;
  git_commit: string | null;
  version: number;
}

export interface SearchResult {
  node: CodeNode;
  score: number;
  match_field: string;
}

export interface TraceResult {
  node: CodeNode;
  edge: CodeEdge;
  direction: 'inbound' | 'outbound';
  depth: number;
}

export interface ArchitectureSummary {
  project: string;
  languages: Record<string, number>;
  packages: string[];
  entry_points: Array<{ name: string; type: string }>;
  routes: Array<{ method: string; path: string; handler: string }>;
  hotspots: Array<{ name: string; caller_count: number; callee_count: number }>;
  clusters: Array<{ id: number; name: string; member_count: number }>;
  nodes: CodeNode[];
  edges: CodeEdge[];
  node_count: number;
  edge_count: number;
}

/** Maps file extensions to tree-sitter language names */
export const EXTENSION_LANG_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.pyi': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.hh': 'cpp',
  '.cs': 'c_sharp',
  '.php': 'php',
  '.rb': 'ruby',
  '.swift': 'swift',
  '.scala': 'scala',
  '.lua': 'lua',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.sql': 'sql',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.proto': 'protobuf',
  '.tf': 'hcl',
  '.hcl': 'hcl',
  '.dockerfile': 'dockerfile',
  '.cmake': 'cmake',
  '.el': 'elisp',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.erl': 'erlang',
  '.hrl': 'erlang',
  '.hs': 'haskell',
  '.ml': 'ocaml',
  '.mli': 'ocaml',
  '.dart': 'dart',
  '.r': 'r',
  '.zig': 'zig',
  '.nim': 'nim',
};

/** Directories always ignored during indexing */
export const DEFAULT_IGNORE_DIRS = new Set([
  '.git',
  'node_modules',
  '__pycache__',
  '.venv',
  'venv',
  '.tox',
  'dist',
  'build',
  'target',
  '.next',
  '.nuxt',
  '.output',
  '.cache',
  'coverage',
  '.nyc_output',
  '.turbo',
  '.codebase-memory',
  '.codegraph',
]);

/** Files always ignored during indexing */
export const DEFAULT_IGNORE_FILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'Cargo.lock',
  'Gemfile.lock',
  'poetry.lock',
  'Pipfile.lock',
  'deno.lock',
  'go.sum',
  'composer.lock',
  '.DS_Store',
  'Thumbs.db',
]);
