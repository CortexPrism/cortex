import {
  bulkInsertEdges,
  bulkInsertNodes,
  clearProjectNodes,
  deleteFileNodes,
  getFileHash,
  getProject,
  rebuildFtsIndex,
  setFileHash,
  updateProjectCounts,
  upsertProject,
} from './graph.ts';
import { parseFile } from './indexer.ts';
import { buildResolutionContext, resolveEdges } from './resolver.ts';
import type { ExtractedEdge, ExtractedNode } from './indexer.ts';
import { DEFAULT_IGNORE_DIRS, DEFAULT_IGNORE_FILES } from './schema.ts';
import type { CodeEdgeType } from './schema.ts';

const BATCH_SIZE = 50;
const MAX_FILES = 200_000;
const MAX_DEPTH = 100;
const BULK_CHUNK_SIZE = 1_000;

async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function discoverFiles(
  rootPath: string,
  _gitignorePatterns: string[] = [],
): Promise<string[]> {
  const files: string[] = [];
  const seen = new Set<string>();

  async function walk(dir: string, relativeDir: string, depth: number): Promise<boolean> {
    if (depth > MAX_DEPTH) return false;
    const entries: Deno.DirEntry[] = [];
    try {
      for await (const entry of Deno.readDir(dir)) {
        entries.push(entry);
      }
    } catch (e) {
      console.error('[codegraph] discoverFiles: readDir failed for ' + dir + ' — ' + (e as Error).message);
      return false;
    }

    for (const entry of entries) {
      if (files.length >= MAX_FILES) return false;
      const fullPath = `${dir}/${entry.name}`;
      const relPath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;

      if (entry.isDirectory) {
        if (DEFAULT_IGNORE_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith('.') && entry.name !== '.') continue;
        let realPath: string;
        try {
          realPath = await Deno.realPath(fullPath);
        } catch {
          continue;
        }
        if (seen.has(realPath)) continue;
        seen.add(realPath);
        const ok = await walk(fullPath, relPath, depth + 1);
        if (!ok) return false;
      } else if (entry.isFile) {
        if (DEFAULT_IGNORE_FILES.has(entry.name)) continue;
        const ext = entry.name.includes('.') ? entry.name.slice(entry.name.lastIndexOf('.')) : '';
        if (ext.length === 0 && entry.name !== 'Dockerfile' && entry.name !== 'Makefile') continue;
        files.push(fullPath);
      }
    }
    return true;
  }

  await walk(rootPath, '', 1);
  return files;
}

async function indexFile(
  filePath: string,
  rootPath: string,
): Promise<
  {
    nodes: ExtractedNode[];
    edges: ExtractedEdge[];
    relPath: string;
    language: string;
    hash: string;
  } | { error: string } | null
> {
  try {
    const source = await Deno.readTextFile(filePath);
    const hash = await hashContent(source);
    const relPath = filePath.startsWith(rootPath)
      ? filePath.slice(rootPath.length).replace(/^\//, '')
      : filePath;

    const result = await parseFile(filePath, source);
    if (result.error) {
      if (result.error === 'Unsupported language' || result.error.startsWith('Grammar not available')) return null;
      console.error('[codegraph] parse error: ' + filePath + ' — ' + result.error);
      return { error: result.error };
    }
    if (result.nodes.length === 0) return null;

    return {
      nodes: result.nodes.map((n) => ({
        ...n,
        qualifiedName: `${relPath}:${n.name}`,
      })),
      edges: result.edges.map((e) => ({
        ...e,
        sourceQName: e.sourceQName || `${relPath}`,
      })),
      relPath,
      language: result.language,
      hash,
    };
  } catch (e) {
    console.error('[codegraph] indexFile: failed for ' + filePath + ' — ' + (e as Error).message);
    return null;
  }
}

export async function indexRepository(
  rootPath: string,
  projectName?: string,
): Promise<{ project: string; nodeCount: number; edgeCount: number; durationMs: number; fileCount: number; errorCount: number; errorSample: string[] }> {
  const start = Date.now();
  const name = projectName ?? rootPath.split('/').pop() ?? 'unknown';
  let errorCount = 0;
  const errorSample: string[] = [];

  console.error('[codegraph] indexRepository starting: rootPath=' + rootPath + ' projectName=' + name);

  const project = await upsertProject(name, rootPath);
  await clearProjectNodes(project.id);

  const files = await discoverFiles(rootPath);
  console.error('[codegraph] indexRepository: discovered ' + files.length + ' files');
  const languageStats: Record<string, number> = {};

  const allNodes: Array<ExtractedNode & { projectId: number }> = [];
  const allEdges: Array<{
    type: string;
    sourceQName: string;
    targetQName: string;
    confidence: number;
    callLine: number | null;
    argToParam: string | null;
    sourceFilePath: string;
    metadata: Record<string, unknown>;
  }> = [];
  const parsedSources: Array<{
    filePath: string;
    source: string;
    language: string;
    nodes: ExtractedNode[];
  }> = [];
  const nodeImportMaps = new Map<string, string[]>();

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((f) => indexFile(f, rootPath)));

    for (const result of results) {
      if (!result) { errorCount++; continue; }
      if ('error' in result) { errorCount++; if (errorSample.length < 5) errorSample.push(result.error); continue; }
      languageStats[result.language] = (languageStats[result.language] ?? 0) + 1;

      for (const node of result.nodes) {
        allNodes.push({ ...node, projectId: project.id });
      }

      for (const edge of result.edges) {
        allEdges.push({
          ...edge,
          sourceFilePath: result.relPath,
        });
      }

      const fileSource = await Deno.readTextFile(
        result.relPath.startsWith('/') ? result.relPath : `${rootPath}/${result.relPath}`,
      ).catch(() => null);
      if (fileSource) {
        parsedSources.push({
          filePath: result.relPath,
          source: fileSource,
          language: result.language,
          nodes: result.nodes,
        });
      }

      await setFileHash(project.id, result.relPath, result.hash);
    }
  }

  const nodeIds = await chunkedBulkInsertNodes(
    project.id,
    allNodes,
  );

  const validNodeIds = new Set(nodeIds);
  const nodeIdMap = new Map<string, number>();
  for (let i = 0; i < allNodes.length; i++) {
    nodeIdMap.set(allNodes[i].qualifiedName, nodeIds[i]);
  }

  const ctx = await buildResolutionContext(project.id, parsedSources, nodeIdMap);

  const resolvedEdges = await resolveEdges(
    ctx,
    allEdges.map((e) => ({
      ...e,
      sourceFilePath: e.sourceFilePath,
    })),
  );

  const validEdges = resolvedEdges.filter(function(e) {
    return validNodeIds.has(e.sourceId) && validNodeIds.has(e.targetId);
  });
  if (validEdges.length < resolvedEdges.length) {
    console.error('[codegraph] filtered ' + (resolvedEdges.length - validEdges.length) + ' edges with invalid source/target IDs');
  }

  const edgeIds = await chunkedBulkInsertEdges(
    project.id,
    validEdges,
  );

  await updateProjectCounts(project.id);
  await upsertProject(name, rootPath, languageStats);

  await updateProjectCounts(project.id);

  await rebuildFtsIndex();

  const duration = Date.now() - start;
  const languageStatsStr = Object.entries(languageStats).map(function(e) { return e[0] + ':' + e[1]; }).join(', ');
  console.error('[codegraph] indexRepository complete: ' + nodeIds.length + ' nodes, ' + edgeIds.length + ' edges, ' + files.length + ' files, ' + errorCount + ' errors, lang=[' + languageStatsStr + '] in ' + duration + 'ms');

  return {
    project: name,
    nodeCount: nodeIds.length,
    edgeCount: edgeIds.length,
    durationMs: duration,
    fileCount: files.length,
    errorCount: errorCount,
    errorSample: errorSample,
  };
}

async function chunkedBulkInsertNodes(
  projectId: number,
  nodes: Array<ExtractedNode & { projectId: number }>,
): Promise<number[]> {
  const allIds: number[] = [];
  for (let i = 0; i < nodes.length; i += BULK_CHUNK_SIZE) {
    const chunk = nodes.slice(i, i + BULK_CHUNK_SIZE);
    const ids = await bulkInsertNodes(
      chunk.map((n) => ({
        project_id: n.projectId,
        label: n.label,
        name: n.name,
        qualified_name: n.qualifiedName,
        file_path: n.filePath,
        line_start: n.lineStart,
        line_end: n.lineEnd,
        signature: n.signature,
        return_type: n.returnType,
        language: n.language,
        is_exported: n.isExported,
        complexity: n.complexity,
        decorators: n.decorators,
        metadata: n.metadata ? JSON.stringify(n.metadata) : null,
        content_hash: null,
      })),
    );
    allIds.push(...ids);
  }
  return allIds;
}

async function chunkedBulkInsertEdges(
  projectId: number,
  edges: Array<{
    type: string;
    sourceId: number;
    targetId: number;
    confidence: number;
    callLine: number | null;
    argToParam: string | null;
  }>,
): Promise<number[]> {
  const allIds: number[] = [];
  for (let i = 0; i < edges.length; i += BULK_CHUNK_SIZE) {
    const chunk = edges.slice(i, i + BULK_CHUNK_SIZE);
    const ids = await bulkInsertEdges(
      chunk.map((e) => ({
        project_id: projectId,
        type: e.type as CodeEdgeType,
        source_id: e.sourceId,
        target_id: e.targetId,
        confidence: e.confidence,
        call_line: e.callLine,
        arg_to_param: e.argToParam ?? null,
        metadata: null,
      })),
    );
    allIds.push(...ids);
  }
  return allIds;
}

export async function incrementalSync(
  rootPath: string,
  projectName?: string,
): Promise<{ project: string; addedNodes: number; addedEdges: number }> {
  const name = projectName ?? rootPath.split('/').pop() ?? 'unknown';
  let project = await getProject(name);
  if (!project) {
    const result = await indexRepository(rootPath, projectName);
    return { project: result.project, addedNodes: result.nodeCount, addedEdges: result.edgeCount };
  }

  const files = await discoverFiles(rootPath);
  let addedNodes = 0;
  let addedEdges = 0;

  for (const filePath of files) {
    try {
      const source = await Deno.readTextFile(filePath);
      const hash = await hashContent(source);
      const relPath = filePath.startsWith(rootPath)
        ? filePath.slice(rootPath.length).replace(/^\//, '')
        : filePath;

      const existingHash = await getFileHash(project!.id, relPath);
      if (existingHash === hash) continue;

      await deleteFileNodes(project!.id, relPath);

      const result = await indexFile(filePath, rootPath);
      if (!result || 'error' in result || result.nodes.length === 0) continue;

      const nodeIds = await bulkInsertNodes(
        result.nodes.map((n) => ({
          project_id: project!.id,
          label: n.label,
          name: n.name,
          qualified_name: n.qualifiedName,
          file_path: n.filePath,
          line_start: n.lineStart,
          line_end: n.lineEnd,
          signature: n.signature ?? null,
          return_type: n.returnType ?? null,
          language: n.language,
          is_exported: n.isExported,
          complexity: n.complexity,
          decorators: n.decorators ?? null,
          metadata: n.metadata ? JSON.stringify(n.metadata) : null,
          content_hash: null,
        })),
      );

      addedNodes += nodeIds.length;

      if (result.edges.length > 0) {
        const nodeIdMap = new Map<string, number>();
        for (let j = 0; j < result.nodes.length; j++) {
          nodeIdMap.set(result.nodes[j].qualifiedName, nodeIds[j]);
        }
        const source = await Deno.readTextFile(
          result.relPath.startsWith('/') ? result.relPath : `${rootPath}/${result.relPath}`,
        ).catch(() => null);
        const ctx = await buildResolutionContext(project!.id, [{
          filePath: result.relPath,
          source: source ?? '',
          language: result.language,
          nodes: result.nodes,
        }], nodeIdMap);

        const resolved = await resolveEdges(
          ctx,
          result.edges.map((e) => ({
            ...e,
            sourceFilePath: result.relPath,
          })),
        );

        if (resolved.length > 0) {
          const edgeIds = await bulkInsertEdges(
            resolved.map((e) => ({
              project_id: project!.id,
              type: e.type as CodeEdgeType,
              source_id: e.sourceId,
              target_id: e.targetId,
              confidence: e.confidence,
              call_line: e.callLine,
              arg_to_param: e.argToParam ?? null,
              metadata: null,
            })),
          );
          addedEdges += edgeIds.length;
        }
      }

      await setFileHash(project!.id, relPath, hash);
    } catch { /* skip */ }
  }

  await updateProjectCounts(project.id);

  await rebuildFtsIndex();

  return { project: name, addedNodes, addedEdges };
}

export async function watchRepository(
  rootPath: string,
  projectName?: string,
  onSync?: (result: { project: string; addedNodes: number; addedEdges: number }) => void,
): Promise<() => void> {
  const name = projectName ?? rootPath.split('/').pop() ?? 'unknown';
  await incrementalSync(rootPath, name);

  const watcher = Deno.watchFs(rootPath, { recursive: true });
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function handleChange() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const result = await incrementalSync(rootPath, name);
        onSync?.(result);
      } catch { /* ignore watcher errors */ }
    }, 2000);
  }

  (async () => {
    for await (const event of watcher) {
      if (event.kind === 'modify' || event.kind === 'create') {
        await handleChange();
      }
    }
  })().catch(() => {});

  return () => {
    if (timer) clearTimeout(timer);
    try {
      watcher.close();
    } catch { /* ignore */ }
  };
}
