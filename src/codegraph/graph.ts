import { getMemoryDb } from '../db/client.ts';
import type { InValue } from 'npm:@libsql/client';
import type {
  ArchitectureSummary,
  CodeEdge,
  CodeEdgeType,
  CodeNode,
  CodeNodeLabel,
  CodeProject,
  SearchResult,
  TraceResult,
} from './schema.ts';

function nodeFromRow(row: Record<string, unknown>): CodeNode {
  return {
    id: row.id as number,
    project_id: row.project_id as number,
    label: row.label as CodeNodeLabel,
    name: row.name as string,
    qualified_name: row.qualified_name as string,
    file_path: row.file_path as string | null,
    line_start: row.line_start as number | null,
    line_end: row.line_end as number | null,
    signature: row.signature as string | null,
    return_type: row.return_type as string | null,
    language: row.language as string | null,
    is_exported: Boolean(row.is_exported),
    complexity: row.complexity as number,
    decorators: row.decorators as string | null,
    metadata: row.metadata as string | null,
    content_hash: row.content_hash as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function edgeFromRow(row: Record<string, unknown>): CodeEdge {
  return {
    id: row.id as number,
    project_id: row.project_id as number,
    type: row.type as CodeEdgeType,
    source_id: row.source_id as number,
    target_id: row.target_id as number,
    confidence: row.confidence as number,
    call_line: row.call_line as number | null,
    arg_to_param: row.arg_to_param as string | null,
    metadata: row.metadata as string | null,
    created_at: row.created_at as string,
  };
}

async function insertAndGetId(
  db: Awaited<ReturnType<typeof getMemoryDb>>,
  sql: string,
  args: InValue[],
): Promise<number> {
  await db.run(sql, args);
  const row = await db.get<{ id: number }>(`SELECT last_insert_rowid() as id`);
  return row?.id ?? 0;
}

export async function upsertProject(
  name: string,
  rootPath: string,
  languageStats?: Record<string, number>,
  gitCommit?: string,
): Promise<CodeProject> {
  const db = await getMemoryDb();
  const existing = await db.get<CodeProject>(
    `SELECT * FROM code_projects WHERE name = ?`,
    [name],
  );
  if (existing) {
    await db.run(
      `UPDATE code_projects SET root_path = ?, language_stats = ?, git_commit = ?, indexed_at = datetime('now'), version = version + 1 WHERE id = ?`,
      [
        rootPath,
        languageStats ? JSON.stringify(languageStats) : null,
        gitCommit ?? null,
        existing.id,
      ],
    );
    return {
      ...existing,
      language_stats: languageStats ? JSON.stringify(languageStats) : existing.language_stats,
    };
  }
  const id = await insertAndGetId(
    db,
    `INSERT INTO code_projects (name, root_path, language_stats, git_commit) VALUES (?, ?, ?, ?)`,
    [name, rootPath, languageStats ? JSON.stringify(languageStats) : null, gitCommit ?? null],
  );
  return {
    id,
    name,
    root_path: rootPath,
    language_stats: languageStats ? JSON.stringify(languageStats) : null,
    node_count: 0,
    edge_count: 0,
    indexed_at: new Date().toISOString(),
    git_commit: gitCommit ?? null,
    version: 1,
  };
}

export async function getProject(name: string): Promise<CodeProject | undefined> {
  const db = await getMemoryDb();
  const row = await db.get<Record<string, unknown>>(
    `SELECT * FROM code_projects WHERE name = ?`,
    [name],
  );
  if (!row) return undefined;
  return {
    id: row.id as number,
    name: row.name as string,
    root_path: row.root_path as string,
    language_stats: row.language_stats as string | null,
    node_count: row.node_count as number,
    edge_count: row.edge_count as number,
    indexed_at: row.indexed_at as string,
    git_commit: row.git_commit as string | null,
    version: row.version as number,
  };
}

export async function listProjects(): Promise<CodeProject[]> {
  const db = await getMemoryDb();
  const rows = await db.all<CodeProject>(
    `SELECT * FROM code_projects ORDER BY indexed_at DESC`,
  );
  return rows;
}

export async function getNodeByQName(
  projectId: number,
  qualifiedName: string,
): Promise<CodeNode | undefined> {
  const db = await getMemoryDb();
  const row = await db.get<Record<string, unknown>>(
    `SELECT * FROM code_nodes WHERE project_id = ? AND qualified_name = ?`,
    [projectId, qualifiedName],
  );
  return row ? nodeFromRow(row) : undefined;
}

export async function getNodeById(id: number): Promise<CodeNode | undefined> {
  const db = await getMemoryDb();
  const row = await db.get<Record<string, unknown>>(
    `SELECT * FROM code_nodes WHERE id = ?`,
    [id],
  );
  return row ? nodeFromRow(row) : undefined;
}

export async function searchNodes(
  projectId: number,
  opts: {
    namePattern?: string;
    label?: CodeNodeLabel | CodeNodeLabel[];
    filePattern?: string;
    language?: string;
    isExported?: boolean;
    minDegree?: number;
    maxDegree?: number;
    offset?: number;
    limit?: number;
  } = {},
): Promise<SearchResult[]> {
  const db = await getMemoryDb();
  const conditions: string[] = ['n.project_id = ?'];
  const params: InValue[] = [projectId];

  if (opts.namePattern) {
    conditions.push(`n.name LIKE ?`);
    params.push(`%${opts.namePattern}%`);
  }
  if (opts.label) {
    const labels = Array.isArray(opts.label) ? opts.label : [opts.label];
    conditions.push(`n.label IN (${labels.map(() => '?').join(',')})`);
    params.push(...labels);
  }
  if (opts.filePattern) {
    conditions.push(`n.file_path LIKE ?`);
    params.push(`%${opts.filePattern}%`);
  }
  if (opts.language) {
    conditions.push(`n.language = ?`);
    params.push(opts.language);
  }
  if (opts.isExported !== undefined) {
    conditions.push(`n.is_exported = ?`);
    params.push(opts.isExported ? 1 : 0);
  }

  const where = conditions.join(' AND ');
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  let query = `SELECT n.* FROM code_nodes n WHERE ${where}`;

  if (opts.minDegree !== undefined || opts.maxDegree !== undefined) {
    query = `
      SELECT n.*, COUNT(e.id) as degree FROM code_nodes n
      LEFT JOIN code_edges e ON (e.source_id = n.id OR e.target_id = n.id) AND e.project_id = n.project_id
      WHERE ${where}
      GROUP BY n.id
    `;
    if (opts.minDegree !== undefined) {
      query += ` HAVING degree >= ${opts.minDegree}`;
    }
    if (opts.maxDegree !== undefined) {
      query += ` AND degree <= ${opts.maxDegree}`;
    }
  }

  query += ` ORDER BY n.updated_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const rows = await db.all<Record<string, unknown> & { score?: number }>(query, params);
  return rows.map((r) => ({
    node: nodeFromRow(r),
    score: typeof r.degree === 'number' ? r.degree : 1,
    match_field: opts.namePattern
      ? 'name' as const
      : opts.filePattern
      ? 'file' as const
      : 'label' as const,
  }));
}

export async function ftsSearchNodes(
  projectId: number,
  query: string,
  opts: { label?: CodeNodeLabel | CodeNodeLabel[]; language?: string; limit?: number } = {},
): Promise<SearchResult[]> {
  const db = await getMemoryDb();
  const limit = opts.limit ?? 20;
  const labels = opts.label ? Array.isArray(opts.label) ? opts.label : [opts.label] : [];
  const hasLanguage = !!opts.language;

  let sql = `
    SELECT n.*, rank FROM code_nodes_fts f
    JOIN code_nodes n ON n.id = f.rowid
    WHERE n.project_id = ? AND code_nodes_fts MATCH ?
  `;
  const params: InValue[] = [projectId, `"${query.replace(/"/g, '""')}"`];

  if (labels.length > 0) {
    sql += ` AND n.label IN (${labels.map(() => '?').join(',')})`;
    params.push(...labels);
  }

  if (hasLanguage && opts.language) {
    sql += ` AND n.language = ?`;
    params.push(opts.language as InValue);
  }

  sql += ` ORDER BY rank LIMIT ?`;
  params.push(limit);

  const rows = await db.all<Record<string, unknown> & { rank: number }>(sql, params);
  return rows.map((r) => ({
    node: nodeFromRow(r),
    score: -(r.rank ?? 0),
    match_field: 'fts',
  }));
}

export async function getLanguages(projectId: number): Promise<string[]> {
  const db = await getMemoryDb();
  const rows = await db.all<{ language: string }>(
    `SELECT DISTINCT language FROM code_nodes WHERE project_id = ? AND language IS NOT NULL`,
    [projectId],
  );
  return rows.map((r) => r.language).filter((l) => l.length > 0).sort();
}

export async function tracePath(
  projectId: number,
  functionName: string,
  opts: { direction?: 'inbound' | 'outbound' | 'both'; maxDepth?: number; limit?: number } = {},
): Promise<TraceResult[]> {
  const db = await getMemoryDb();
  const direction = opts.direction ?? 'both';
  const maxDepth = opts.maxDepth ?? 5;
  const limit = opts.limit ?? 100;

  const root = await db.get<Record<string, unknown>>(
    `SELECT * FROM code_nodes WHERE project_id = ? AND label IN ('CodeFunction','CodeMethod') AND name LIKE ? LIMIT 1`,
    [projectId, `%${functionName}%`],
  );
  if (!root) return [];

  const rootNode = nodeFromRow(root);
  const results: TraceResult[] = [];
  const visited = new Set<number>([rootNode.id]);
  let frontier: number[] = [rootNode.id];
  let depth = 0;
  const edgeTypes = ['CALLS', 'HTTP_CALLS', 'ASYNC_CALLS', 'IMPORTS'];
  const edgeTypePlaceholders = edgeTypes.map(() => '?').join(',');

  while (frontier.length > 0 && depth < maxDepth && results.length < limit) {
    depth++;
    const nextFrontier: number[] = [];

    if (direction === 'outbound' || direction === 'both') {
      const outRows = await db.all<Record<string, unknown>>(
        `SELECT e.*, t.* FROM code_edges e
         JOIN code_nodes t ON t.id = e.target_id
         WHERE e.project_id = ? AND e.source_id IN (${frontier.map(() => '?').join(',')})
           AND e.type IN (${edgeTypePlaceholders})
         ORDER BY e.confidence DESC`,
        [projectId, ...frontier, ...edgeTypes],
      );
      for (const row of outRows) {
        const targetId = row.target_id as number;
        if (visited.has(targetId)) continue;
        if (results.length >= limit) break;
        visited.add(targetId);
        const edge = edgeFromRow(row);
        const node = nodeFromRow(row);
        results.push({ node, edge, direction: 'outbound', depth });
        nextFrontier.push(node.id);
      }
    }

    if (direction === 'inbound' || direction === 'both') {
      const inRows = await db.all<Record<string, unknown>>(
        `SELECT e.*, s.* FROM code_edges e
         JOIN code_nodes s ON s.id = e.source_id
         WHERE e.project_id = ? AND e.target_id IN (${frontier.map(() => '?').join(',')})
           AND e.type IN (${edgeTypePlaceholders})
         ORDER BY e.confidence DESC`,
        [projectId, ...frontier, ...edgeTypes],
      );
      for (const row of inRows) {
        const sourceId = row.source_id as number;
        if (visited.has(sourceId)) continue;
        if (results.length >= limit) break;
        visited.add(sourceId);
        const edge = edgeFromRow(row);
        const node = nodeFromRow(row);
        results.push({ node, edge, direction: 'inbound', depth });
        nextFrontier.push(node.id);
      }
    }

    frontier = nextFrontier;
  }

  return results;
}

export async function getDeadCode(
  projectId: number,
  opts: { limit?: number } = {},
): Promise<CodeNode[]> {
  const db = await getMemoryDb();
  const limit = opts.limit ?? 50;
  const rows = await db.all<Record<string, unknown>>(
    `SELECT n.* FROM code_nodes n
     WHERE n.project_id = ?
       AND n.label IN ('CodeFunction','CodeMethod')
       AND n.name NOT IN ('main','init','__init__','handler','run','start','serve')
       AND n.is_exported = 0
       AND NOT EXISTS (
         SELECT 1 FROM code_edges e
         WHERE e.project_id = n.project_id
           AND e.target_id = n.id
           AND e.type IN ('CALLS','HTTP_CALLS','ASYNC_CALLS')
       )
     ORDER BY n.complexity DESC
     LIMIT ?`,
    [projectId, limit],
  );
  return rows.map(nodeFromRow);
}

export async function getArchitecture(projectId: number): Promise<ArchitectureSummary> {
  const db = await getMemoryDb();

  const project = await db.get<CodeProject>(
    `SELECT * FROM code_projects WHERE id = ?`,
    [projectId],
  );
  if (!project) throw new Error(`Project not found: ${projectId}`);

  const langRows = await db.all<{ language: string; cnt: number }>(
    `SELECT language, COUNT(*) as cnt FROM code_nodes WHERE project_id = ? AND language IS NOT NULL GROUP BY language ORDER BY cnt DESC`,
    [projectId],
  );
  const languages: Record<string, number> = {};
  for (const r of langRows) languages[r.language] = r.cnt;

  const pkgRows = await db.all<{ name: string }>(
    `SELECT DISTINCT name FROM code_nodes WHERE project_id = ? AND label = 'CodePackage' ORDER BY name`,
    [projectId],
  );
  const packages = pkgRows.map((r) => r.name);

  const entryRows = await db.all<{ name: string; label: string }>(
    `SELECT name, label FROM code_nodes WHERE project_id = ? AND is_exported = 1 AND label IN ('CodeFunction','CodeMethod','CodeClass') ORDER BY complexity DESC LIMIT 30`,
    [projectId],
  );
  const entry_points = entryRows.map((r) => ({ name: r.name, type: r.label }));

  const routeRows = await db.all<{ metadata: string | null; handler: string }>(
    `SELECT n.metadata, n.name as handler FROM code_nodes n WHERE n.project_id = ? AND n.label = 'CodeRoute' LIMIT 50`,
    [projectId],
  );
  const routes = routeRows.map((r) => {
    let method = 'GET';
    let path = r.handler;
    try {
      const meta = JSON.parse(r.metadata ?? '{}') as Record<string, unknown>;
      method = (meta.method as string) ?? 'GET';
      path = (meta.path as string) ?? r.handler;
    } catch { /* ignore */ }
    return { method, path, handler: r.handler };
  });

  const hotspotRows = await db.all<{ name: string; caller_count: number; callee_count: number }>(
    `SELECT n.name,
       COUNT(CASE WHEN e.target_id = n.id THEN 1 END) as caller_count,
       COUNT(CASE WHEN e.source_id = n.id THEN 1 END) as callee_count
     FROM code_nodes n
     LEFT JOIN code_edges e ON (e.target_id = n.id OR e.source_id = n.id)
       AND e.project_id = n.project_id AND e.type IN ('CALLS','HTTP_CALLS','ASYNC_CALLS')
     WHERE n.project_id = ? AND n.label IN ('CodeFunction','CodeMethod')
     GROUP BY n.id
     ORDER BY (caller_count + callee_count) DESC LIMIT 15`,
    [projectId],
  );
  const hotspots = hotspotRows.map((r) => ({
    name: r.name,
    caller_count: r.caller_count,
    callee_count: r.callee_count,
  }));

  const clusterRows = await db.all<{ id: number; name: string; member_count: number }>(
    `SELECT id, name, member_count FROM code_communities WHERE project_id = ? ORDER BY member_count DESC LIMIT 10`,
    [projectId],
  );
  const clusters = clusterRows.map((r) => ({
    id: r.id,
    name: r.name,
    member_count: r.member_count,
  }));

  return {
    project: project.name,
    languages,
    packages,
    entry_points,
    routes,
    hotspots,
    clusters,
    nodes: await db.all<CodeNode>(
      `SELECT * FROM code_nodes WHERE project_id = ? ORDER BY label, name`,
      [projectId],
    ),
    edges: await db.all<CodeEdge>(
      `SELECT * FROM code_edges WHERE project_id = ? ORDER BY type`,
      [projectId],
    ),
    node_count: project.node_count,
    edge_count: project.edge_count,
  };
}

export async function bulkInsertNodes(
  nodes: Omit<CodeNode, 'id' | 'created_at' | 'updated_at'>[],
): Promise<number[]> {
  if (nodes.length === 0) return [];
  const db = await getMemoryDb();

  const placeholders = nodes.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
  const params: InValue[] = [];
  for (const n of nodes) {
    params.push(
      n.project_id,
      n.label,
      n.name,
      n.qualified_name,
      n.file_path ?? null,
      n.line_start ?? null,
      n.line_end ?? null,
      n.signature ?? null,
      n.return_type ?? null,
      n.language ?? null,
      n.is_exported ? 1 : 0,
      n.complexity,
      n.decorators ?? null,
      n.metadata ?? null,
      n.content_hash ?? null,
    );
  }

  try {
    await db.run(`BEGIN`);
    await db.run(
      `INSERT INTO code_nodes (project_id, label, name, qualified_name, file_path, line_start, line_end, signature, return_type, language, is_exported, complexity, decorators, metadata, content_hash)
       VALUES ${placeholders}`,
      params,
    );
    const row = await db.get<{ id: number }>(`SELECT last_insert_rowid() as id`);
    await db.run(`COMMIT`);
    const firstId = row?.id ?? 0;
    const ids: number[] = [];
    for (let i = 0; i < nodes.length; i++) {
      ids.push(firstId + i);
    }
    return ids;
  } catch (e) {
    try {
      await db.run(`ROLLBACK`);
    } catch { /* ignore */ }
    throw e;
  }
}

export async function rebuildFtsIndex(): Promise<void> {
  const db = await getMemoryDb();
  await db.run(`INSERT INTO code_nodes_fts(code_nodes_fts) VALUES('rebuild')`);
}

export async function bulkInsertEdges(
  edges: Omit<CodeEdge, 'id' | 'created_at'>[],
): Promise<number[]> {
  if (edges.length === 0) return [];
  const db = await getMemoryDb();

  const projectId = edges[0].project_id;
  const existingNodeIds = new Set<number>();
  const nodeRows = await db.all<{ id: number }>(
    `SELECT id FROM code_nodes WHERE project_id = ?`,
    [projectId],
  );
  for (const r of nodeRows) existingNodeIds.add(r.id);

  const validEdges = edges.filter((e) =>
    existingNodeIds.has(e.source_id) && existingNodeIds.has(e.target_id)
  );

  if (validEdges.length === 0) return [];

  const placeholders = validEdges.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
  const params: InValue[] = [];
  for (const e of validEdges) {
    params.push(
      e.project_id,
      e.type,
      e.source_id,
      e.target_id,
      e.confidence,
      e.call_line ?? null,
      e.arg_to_param ?? null,
      e.metadata ?? null,
    );
  }

  const before = await db.get<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM code_edges WHERE project_id = ?`,
    [projectId],
  );

  await db.run(
    `INSERT OR IGNORE INTO code_edges (project_id, type, source_id, target_id, confidence, call_line, arg_to_param, metadata)
     VALUES ${placeholders}`,
    params,
  );

  const afterInsert = await db.get<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM code_edges WHERE project_id = ?`,
    [projectId],
  );

  await db.run(
    `DELETE FROM code_edges WHERE project_id = ? AND (source_id NOT IN (SELECT id FROM code_nodes WHERE project_id = ?) OR target_id NOT IN (SELECT id FROM code_nodes WHERE project_id = ?))`,
    [projectId, projectId],
  );

  const inserted = Math.max(0, (afterInsert?.cnt ?? 0) - (before?.cnt ?? 0));
  if (inserted < validEdges.length) {
    console.error(
      `[codegraph] bulkInsertEdges: inserted ${inserted} of ${validEdges.length} valid edges (${edges.length} total, filtered ${
        edges.length - validEdges.length
      } invalid)`,
    );
  }
  return new Array(inserted).fill(0).map((_, i) => i);
}

export async function updateProjectCounts(projectId: number): Promise<void> {
  const db = await getMemoryDb();
  await db.run(
    `UPDATE code_projects SET
       node_count = (SELECT COUNT(*) FROM code_nodes WHERE project_id = ?),
       edge_count = (SELECT COUNT(*) FROM code_edges WHERE project_id = ?)
     WHERE id = ?`,
    [projectId, projectId, projectId],
  );
}

export async function clearProjectNodes(projectId: number): Promise<void> {
  const db = await getMemoryDb();
  await db.run(`DELETE FROM code_file_hashes WHERE project_id = ?`, [projectId]);
  await db.run(`DELETE FROM code_communities WHERE project_id = ?`, [projectId]);
  await db.run(`DELETE FROM code_edges WHERE project_id = ?`, [projectId]);
  await db.run(`DELETE FROM code_nodes WHERE project_id = ?`, [projectId]);
}

export async function getFileHash(
  projectId: number,
  filePath: string,
): Promise<string | undefined> {
  const db = await getMemoryDb();
  const row = await db.get<{ hash: string }>(
    `SELECT hash FROM code_file_hashes WHERE project_id = ? AND file_path = ?`,
    [projectId, filePath],
  );
  return row?.hash;
}

export async function setFileHash(
  projectId: number,
  filePath: string,
  hash: string,
): Promise<void> {
  const db = await getMemoryDb();
  await db.run(
    `INSERT OR REPLACE INTO code_file_hashes (project_id, file_path, hash, updated_at)
     VALUES (?, ?, ?, datetime('now'))`,
    [projectId, filePath, hash],
  );
}

export async function deleteFileNodes(projectId: number, filePath: string): Promise<void> {
  const db = await getMemoryDb();
  await db.run(
    `DELETE FROM code_edges WHERE project_id = ? AND (source_id IN (SELECT id FROM code_nodes WHERE project_id = ? AND file_path = ?) OR target_id IN (SELECT id FROM code_nodes WHERE project_id = ? AND file_path = ?))`,
    [projectId, projectId, filePath, projectId, filePath],
  );
  await db.run(
    `DELETE FROM code_nodes WHERE project_id = ? AND file_path = ?`,
    [projectId, filePath],
  );
}
