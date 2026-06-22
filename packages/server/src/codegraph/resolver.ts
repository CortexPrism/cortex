import type { getNodeByQName, searchNodes } from './graph.ts';
import type { ExtractedEdge, ExtractedNode } from './indexer.ts';

interface ResolvedEdge {
  type: string;
  sourceId: number;
  targetId: number;
  confidence: number;
  callLine: number | null;
  argToParam: string | null;
}

interface ImportMapEntry {
  alias: string;
  modulePath: string;
}

interface ResolutionContext {
  projectId: number;
  nodeMap: Map<string, number>;
  importMaps: Map<string, ImportMapEntry[]>;
  nodeIndex: Map<string, number[]>;
  fileNodeMap: Map<string, number>;
}

function parseImportMap(source: string, language: string): ImportMapEntry[] {
  const entries: ImportMapEntry[] = [];
  const lines = source.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    if (language === 'typescript' || language === 'javascript' || language === 'tsx') {
      const namedMatch = trimmed.match(
        /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/,
      );
      if (namedMatch) {
        const names = namedMatch[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()!.trim());
        const modulePath = namedMatch[2];
        for (const alias of names) {
          if (alias) entries.push({ alias, modulePath });
        }
      }

      const defaultMatch = trimmed.match(
        /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/,
      );
      if (defaultMatch) {
        entries.push({ alias: defaultMatch[1], modulePath: defaultMatch[2] });
      }

      const nsMatch = trimmed.match(
        /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/,
      );
      if (nsMatch) {
        entries.push({ alias: nsMatch[1], modulePath: nsMatch[2] });
      }

      const reqMatch = trimmed.match(
        /(?:const|let|var)\s+(\w+)\s*=\s*require\s*\(['"]([^'"]+)['"]\)/,
      );
      if (reqMatch) {
        entries.push({ alias: reqMatch[1], modulePath: reqMatch[2] });
      }
    }

    if (language === 'python') {
      const impMatch = trimmed.match(/^(?:from\s+(\S+)\s+)?import\s+(.+)$/);
      if (impMatch) {
        const module = impMatch[1] ?? '';
        const names = impMatch[2].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]);
        for (const name of names) {
          entries.push({
            alias: name,
            modulePath: module ? `${module}.${name}` : name,
          });
        }
      }
    }

    if (language === 'go') {
      const impMatch = trimmed.match(/import\s+(?:\w+\s+)?["']([^"']+)["']/);
      if (impMatch) {
        const path = impMatch[1];
        const parts = path.split('/');
        entries.push({ alias: parts[parts.length - 1], modulePath: path });
      }
      const namedMatch = trimmed.match(/import\s+(\w+)\s+["']([^"']+)["']/);
      if (namedMatch) {
        entries.push({ alias: namedMatch[1], modulePath: namedMatch[2] });
      }
    }

    if (language === 'rust') {
      const useMatch = trimmed.match(/use\s+([\w:]+(?:::[\w:]+)*)(?:\s*::\s*\{[^}]+\})?\s*;/);
      if (useMatch) {
        const path = useMatch[1];
        const parts = path.split('::');
        entries.push({ alias: parts[parts.length - 1], modulePath: path });
      }
    }

    if (language === 'java' || language === 'kotlin') {
      const impMatch = trimmed.match(/import\s+([\w.]+(?:\.\*)?)\s*;/);
      if (impMatch) {
        const path = impMatch[1];
        const parts = path.split('.');
        entries.push({ alias: parts[parts.length - 1].replace('*', ''), modulePath: path });
      }
    }
  }

  return entries;
}

export async function buildResolutionContext(
  projectId: number,
  parsedFiles: Array<{
    filePath: string;
    source: string;
    language: string;
    nodes: ExtractedNode[];
  }>,
  nodeIdMap: Map<string, number>,
): Promise<ResolutionContext> {
  const importMaps = new Map<string, ImportMapEntry[]>();
  const nodeIndex = new Map<string, number[]>();
  const fileNodeMap = new Map<string, number>();

  for (const file of parsedFiles) {
    importMaps.set(file.filePath, parseImportMap(file.source, file.language));
  }

  for (const [qname, id] of nodeIdMap) {
    const simpleName = qname.split(':').pop()?.split('.').pop() ?? qname;
    const existing = nodeIndex.get(simpleName) ?? [];
    existing.push(id);
    nodeIndex.set(simpleName, existing);
    const filePath = qname.split(':')[0] || '';
    if (filePath && !fileNodeMap.has(filePath)) {
      fileNodeMap.set(filePath, id);
    }
  }

  return { projectId, nodeMap: nodeIdMap, importMaps, nodeIndex, fileNodeMap };
}

function resolveTarget(
  targetQName: string,
  sourceFile: string,
  ctx: ResolutionContext,
): { targetId: number | null; confidence: number } {
  if (ctx.nodeMap.has(targetQName)) {
    return { targetId: ctx.nodeMap.get(targetQName)!, confidence: 0.95 };
  }

  const simpleName = targetQName.split('.').pop() ?? targetQName;
  const candidates = ctx.nodeIndex.get(simpleName) ?? [];

  if (targetQName.includes('.')) {
    const parts = targetQName.split('.');
    const prefix = parts.slice(0, -1).join('.');

    const importMap = ctx.importMaps.get(sourceFile) ?? [];
    let importResolved = false;
    for (const entry of importMap) {
      if (entry.alias === prefix || targetQName.startsWith(entry.alias + '.')) {
        for (const id of candidates) {
          return { targetId: id, confidence: 0.85 };
        }
        importResolved = true;
        break;
      }
    }

    if (!importResolved && candidates.length > 0) {
      return { targetId: candidates[0], confidence: 0.7 };
    }
  }

  if (candidates.length === 1) {
    return { targetId: candidates[0], confidence: 0.6 };
  }

  if (candidates.length > 1) {
    return { targetId: candidates[0], confidence: 0.4 };
  }

  return { targetId: null, confidence: 0 };
}

export async function resolveEdges(
  ctx: ResolutionContext,
  edges: Array<ExtractedEdge & { sourceFilePath: string }>,
): Promise<ResolvedEdge[]> {
  const resolved: ResolvedEdge[] = [];

  for (const edge of edges) {
    let sourceId = ctx.nodeMap.get(edge.sourceQName);
    if (sourceId === undefined) {
      sourceId = ctx.fileNodeMap.get(edge.sourceFilePath) ?? undefined;
    }
    if (sourceId === undefined) continue;

    let { targetId, confidence } = resolveTarget(
      edge.targetQName,
      edge.sourceFilePath,
      ctx,
    );

    if (targetId === null) {
      const simple = edge.targetQName.split('.').pop() ?? edge.targetQName;
      const result = resolveTarget(simple, edge.sourceFilePath, ctx);
      targetId = result.targetId;
      confidence = result.confidence * 0.5;
    }

    if (targetId === null) continue;

    resolved.push({
      type: edge.type,
      sourceId,
      targetId,
      confidence,
      callLine: edge.callLine,
      argToParam: edge.argToParam,
    });
  }

  return resolved;
}
