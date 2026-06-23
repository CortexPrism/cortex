import { err, json, notFound, type RouteHandler } from './_helpers.ts';
import type { PATHS } from '../../../../../src/config/paths.ts';
import type { exists } from '@std/fs';
import type { join } from '@std/path';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/codegraph\/projects$/,
    handler: async () => {
      const { listProjects: listCodeProjects, deleteCodeProject } = await import(
        '../../codegraph/graph.ts'
      );
      const { listProjects: listFsProjects } = await import('../../projects/manager.ts');
      const codeProjects = await listCodeProjects();
      const fsProjects = await listFsProjects();
      const fsNames = new Set(fsProjects.map((p) => p.name));
      const liveCodeProjects = codeProjects.filter((p) => fsNames.has(p.name));
      const staleProjects = codeProjects.filter((p) => !fsNames.has(p.name));
      for (const stale of staleProjects) {
        deleteCodeProject(stale.name).catch(() => {});
      }
      const codeNames = new Set(liveCodeProjects.map((p) => p.name));
      const merged = [
        ...liveCodeProjects,
        ...fsProjects.filter((p) => !codeNames.has(p.name)).map((p) => ({
          id: -1,
          name: p.name,
          root_path: p.path,
          language_stats: null,
          node_count: 0,
          edge_count: 0,
          indexed_at: p.created,
          git_commit: null,
          version: 0,
        })),
      ];
      return json(merged);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/codegraph\/index$/,
    handler: async (req) => {
      const body = await req.json() as { rootPath: string; projectName?: string };
      if (!body.rootPath) return err('rootPath is required', 400);
      console.error(
        '[codegraph] index endpoint: path=' + body.rootPath + ' name=' +
          (body.projectName || '(auto)'),
      );
      const { indexRepository } = await import('../../codegraph/sync.ts');
      try {
        const result = await indexRepository(body.rootPath, body.projectName);
        console.error(
          '[codegraph] index endpoint: done — ' + result.nodeCount + ' nodes, ' + result.edgeCount +
            ' edges, ' + result.fileCount + ' files, ' + result.errorCount + ' errors',
        );
        return json({
          ok: true,
          nodeCount: result.nodeCount,
          edgeCount: result.edgeCount,
          fileCount: result.fileCount,
          errorCount: result.errorCount,
          errorSample: result.errorSample,
        });
      } catch (e) {
        return err((e as Error).message, 500);
      }
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/codegraph\/search$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const q = url.searchParams.get('q');
      const project = url.searchParams.get('project');
      const language = url.searchParams.get('language') || undefined;
      if (!q) return err('Missing q', 400);
      const { ftsSearchNodes, getProject } = await import('../../codegraph/graph.ts');
      let projectId = 0;
      if (project) {
        const p = await getProject(project);
        if (p) projectId = p.id;
      }
      const results = await ftsSearchNodes(projectId, q, { language });
      return json(results);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/codegraph\/search-all$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const q = url.searchParams.get('q');
      const language = url.searchParams.get('language') || undefined;
      if (!q) return err('Missing q', 400);
      const { ftsSearchNodes, listProjects } = await import('../../codegraph/graph.ts');
      const projects = await listProjects();
      const allResults: Array<unknown> = [];
      for (const p of projects) {
        const results = await ftsSearchNodes(p.id, q, { language, limit: 15 });
        for (const r of results) allResults.push({ ...r, projectName: p.name });
      }
      allResults.sort((a, b) => {
        const sa = (a as Record<string, number>).score ?? 0;
        const sb = (b as Record<string, number>).score ?? 0;
        return sb - sa;
      });
      return json(allResults.slice(0, 30));
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/codegraph\/languages$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const { getProject, getLanguages } = await import('../../codegraph/graph.ts');
      const project = url.searchParams.get('project');
      if (project) {
        const p = await getProject(project);
        if (!p) return notFound('Project not found');
        return json(await getLanguages(p.id));
      }
      const { listProjects } = await import('../../codegraph/graph.ts');
      const projects = await listProjects();
      const langSet = new Set<string>();
      for (const p of projects) {
        const langs = await getLanguages(p.id);
        for (const l of langs) langSet.add(l);
      }
      return json(Array.from(langSet).sort());
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/codegraph\/ownership$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const file = url.searchParams.get('file');
      if (!file) return err('file is required', 400);
      try {
        const cmd = new Deno.Command('git', {
          args: ['blame', '--porcelain', '-L', '1,50', file],
          stderr: 'piped',
          stdout: 'piped',
        });
        const { stdout } = await cmd.output();
        const text = new TextDecoder().decode(stdout);
        const owners: Array<{ name: string; email: string; lines: number }> = [];
        for (const line of text.split('\n')) {
          const authorMatch = line.match(/^author (.+)$/);
          const mailMatch = line.match(/^author-mail <(.+)>$/);
          if (authorMatch && mailMatch) {
            const existing = owners.find((o) => o.email === mailMatch[1]);
            if (existing) existing.lines++;
            else owners.push({ name: authorMatch[1], email: mailMatch[1], lines: 1 });
          }
        }
        return json({ file, owners: owners.sort((a, b) => b.lines - a.lines) });
      } catch {
        return json({ file, owners: [] });
      }
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/codegraph\/history$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const file = url.searchParams.get('file');
      if (!file) return err('file is required', 400);
      const limit = Math.min(Number(url.searchParams.get('limit')) || 10, 50);
      try {
        const cmd = new Deno.Command('git', {
          args: ['log', '--oneline', '--no-decorate', '-n', String(limit), '--', file],
          stderr: 'piped',
          stdout: 'piped',
        });
        const { stdout } = await cmd.output();
        const text = new TextDecoder().decode(stdout);
        const commits = text.split('\n').filter(Boolean).map((line) => {
          const [hash, ...rest] = line.split(' ');
          return { hash, message: rest.join(' ') };
        });
        return json({ file, commits });
      } catch {
        return json({ file, commits: [] });
      }
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/codegraph\/qa$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const q = url.searchParams.get('q');
      const project = url.searchParams.get('project');
      if (!q) return err('q is required', 400);
      const { ftsSearchNodes, getProject } = await import('../../codegraph/graph.ts');
      let projectId = 0;
      if (project) {
        const p = await getProject(project);
        if (p) projectId = p.id;
      }
      const results = await ftsSearchNodes(projectId, q, { limit: 8 });
      const citations = results.map((r) => ({
        name: r.node.name,
        file: r.node.file_path,
        line: r.node.line_start,
        signature: r.node.signature,
        language: r.node.language,
      }));
      const context = citations.map((c) =>
        `${c.name} in ${c.file ?? 'unknown'} (${c.language ?? 'unknown'})`
      ).join('\n');
      return json({
        query: q,
        citations,
        summary: citations.length > 0
          ? `Found ${citations.length} symbol(s) related to "${q}"`
          : `No symbols found for "${q}"`,
        context,
      });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/codegraph\/pilot$/,
    handler: async (req) => {
      const body = await req.json() as {
        maxTokens?: number;
        includeImports?: boolean;
        includeComments?: boolean;
        includeTestFiles?: boolean;
        prunePrivateMembers?: boolean;
        filePattern?: string;
        excludePattern?: string;
        project?: string;
      };
      const { optimizeCodebase, createCodePilotConfig } = await import(
        '../../codegraph/codebase-pilot.ts'
      );
      const { getProject, searchNodes } = await import('../../codegraph/graph.ts');
      const { exists } = await import('@std/fs');
      const { join } = await import('@std/path');
      try {
        let files: Array<{ path: string; content: string }> = [];
        if (body.project) {
          const project = await getProject(body.project);
          if (!project) return notFound('Project not found');
          const projectRoot = project.root_path;
          const nodes = await searchNodes(project.id, { limit: 500 });
          const uniqueFiles = [
            ...new Set(nodes.map((n) => n.node.file_path).filter(Boolean) as string[]),
          ];
          for (const relPath of uniqueFiles.slice(0, 100)) {
            const absPath = join(projectRoot, relPath);
            try {
              if (await exists(absPath)) {
                const content = await Deno.readTextFile(absPath);
                files.push({ path: relPath, content });
              }
            } catch { /* skip */ }
          }
        }
        const config = createCodePilotConfig({
          maxTokens: body.maxTokens ?? 8000,
          includeImports: body.includeImports ?? true,
          includeComments: body.includeComments ?? false,
          includeTestFiles: body.includeTestFiles ?? false,
          prunePrivateMembers: body.prunePrivateMembers ?? true,
          fileAllowlist: body.filePattern ? [body.filePattern] : [],
          fileBlocklist: body.excludePattern
            ? body.excludePattern.split(',').map((s) => s.trim()).filter(Boolean)
            : [],
        });
        const optimized = optimizeCodebase(files, config);
        return json(optimized);
      } catch (e) {
        return err((e as Error).message, 500);
      }
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/alcove\/search$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const q = url.searchParams.get('q');
      if (!q) return err('q is required', 400);
      const { PATHS } = await import('../../../../../src/config/paths.ts');
      const { exists } = await import('@std/fs');
      const { join } = await import('@std/path');
      const docsDir = join(PATHS.dataDir, 'docs');
      const results: Array<{ file: string; snippet: string }> = [];
      try {
        if (!await exists(docsDir)) return json({ query: q, results: [] });
        for await (const entry of Deno.readDir(docsDir)) {
          if (!entry.isFile || !/\.(md|txt|html)$/i.test(entry.name)) continue;
          try {
            const content = await Deno.readTextFile(join(docsDir, entry.name));
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].toLowerCase().includes(q.toLowerCase())) {
                results.push({
                  file: entry.name,
                  snippet: lines.slice(Math.max(0, i - 1), i + 2).join('\n').slice(0, 300),
                });
                if (results.length >= 10) break;
              }
            }
          } catch { /* skip */ }
          if (results.length >= 10) break;
        }
      } catch { /* skip */ }
      return json({ query: q, results });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/alcove\/browse$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const { PATHS } = await import('../../../../../src/config/paths.ts');
      const { exists } = await import('@std/fs');
      const { join } = await import('@std/path');
      const dir = url.searchParams.get('dir');
      const docsDir = join(PATHS.dataDir, 'docs');
      try {
        if (!await exists(docsDir)) return json({ dirs: [], files: [] });
        const targetDir = dir ? join(docsDir, dir.replace(/\.\./g, '')) : docsDir;
        if (!await exists(targetDir)) return json({ dirs: [], files: [] });
        const dirs: string[] = [];
        const files: string[] = [];
        for await (const entry of Deno.readDir(targetDir)) {
          if (entry.isDirectory && !entry.name.startsWith('.')) dirs.push(entry.name);
          else if (entry.isFile && /\.(md|txt|html)$/i.test(entry.name)) files.push(entry.name);
        }
        return json({ dirs: dirs.sort(), files: files.sort() });
      } catch (e) {
        return err((e as Error).message, 500);
      }
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/alcove\/doc$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const file = url.searchParams.get('file');
      if (!file) return err('file is required', 400);
      const { PATHS } = await import('../../../../../src/config/paths.ts');
      const { join } = await import('@std/path');
      const docsDir = join(PATHS.dataDir, 'docs');
      const safeFile = file.replace(/\.\./g, '');
      const filePath = join(docsDir, safeFile);
      try {
        const content = await Deno.readTextFile(filePath);
        return json({ file: safeFile, content });
      } catch {
        return notFound('Document not found');
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/alcove\/index$/,
    handler: async () => {
      const { PATHS } = await import('../../../../../src/config/paths.ts');
      const { exists } = await import('@std/fs');
      const { join } = await import('@std/path');
      const docsDir = join(PATHS.dataDir, 'docs');
      try {
        let count = 0;
        if (await exists(docsDir)) {
          for await (
            const entry of Deno.readDir(docsDir)
          ) if (entry.isFile && /\.(md|txt|html)$/i.test(entry.name)) count++;
        }
        return json({ indexed: count, ok: true });
      } catch (e) {
        return err((e as Error).message, 500);
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/codegraph\/incremental-sync$/,
    handler: async (req) => {
      const body = await req.json() as { projectName: string };
      if (!body.projectName) return err('projectName is required', 400);
      const { getProject } = await import('../../codegraph/graph.ts');
      const p = await getProject(body.projectName);
      if (!p) return notFound('Project not found');
      const { incrementalSync } = await import('../../codegraph/sync.ts');
      try {
        const result = await incrementalSync(p.root_path, body.projectName);
        return json({ addedNodes: result.addedNodes, addedEdges: result.addedEdges });
      } catch (e) {
        return err((e as Error).message, 500);
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/codegraph\/impact$/,
    handler: async (req) => {
      const body = await req.json() as { file?: string; symbol?: string; project: string };
      if (!body.project) return err('project is required', 400);
      const { getProject, tracePath } = await import('../../codegraph/graph.ts');
      const p = await getProject(body.project);
      if (!p) return notFound('Project not found');
      const name = body.symbol || body.file || '';
      const trace = await tracePath(p.id, name, { direction: 'both' });
      return json({
        nodes: trace.map(function (t) {
          return t.node;
        }),
      });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/codegraph\/architecture$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const project = url.searchParams.get('project');
      if (!project) return err('Missing project', 400);
      const { getProject, getArchitecture } = await import('../../codegraph/graph.ts');
      const { updateProjectCounts } = await import('../../codegraph/graph.ts');
      const { getMemoryDb } = await import('../../db/client.ts');
      let p = await getProject(project);
      if (!p) {
        const { loadProject } = await import('../../projects/manager.ts');
        const fsProj = await loadProject(project);
        console.error(
          '[codegraph] architecture endpoint: project=' + project + ' not in codegraph, fsProj=' +
            !!fsProj + ' fsPath=' + (fsProj?.path || 'N/A'),
        );
        if (fsProj?.path) {
          console.error(
            '[codegraph] architecture endpoint: auto-indexing ' + fsProj.path + ' as ' + project,
          );
          try {
            const { indexRepository } = await import('../../codegraph/sync.ts');
            const result = await indexRepository(fsProj.path, project);
            console.error(
              '[codegraph] architecture endpoint: index complete — ' + result.nodeCount +
                ' nodes, ' + result.edgeCount + ' edges in ' + result.durationMs + 'ms',
            );
            p = await getProject(project);
          } catch (e) {
            console.error(
              '[codegraph] architecture endpoint: index FAILED — ' + (e as Error).message,
            );
            p = undefined;
          }
        } else console.error('[codegraph] architecture endpoint: no fsProj path to index');
      } else if (p.node_count === 0) {
        const db = await getMemoryDb();
        const actual = await db.get(
          `SELECT COUNT(*) as cnt FROM code_nodes WHERE project_id = ?`,
          [p.id],
        ) as { cnt: number } | undefined;
        if ((actual?.cnt ?? 0) === 0) {
          console.error(
            '[codegraph] architecture endpoint: project=' + project +
              ' has node_count=0, re-running index',
          );
          const { loadProject } = await import('../../projects/manager.ts');
          const fsProj = await loadProject(project);
          if (fsProj?.path) {
            try {
              const { indexRepository } = await import('../../codegraph/sync.ts');
              const result = await indexRepository(fsProj.path, project);
              console.error(
                '[codegraph] architecture endpoint: index complete — ' + result.nodeCount +
                  ' nodes, ' + result.edgeCount + ' edges in ' + result.durationMs + 'ms',
              );
              p = await getProject(project);
            } catch (e) {
              console.error(
                '[codegraph] architecture endpoint: index FAILED — ' + (e as Error).message,
              );
              p = undefined;
            }
          }
        } else {
          console.error(
            '[codegraph] architecture endpoint: project=' + project +
              ' node_count=0 but actual nodes=' + (actual?.cnt ?? 0) + ', fixing counts',
          );
          await updateProjectCounts(p.id);
          p = await getProject(project);
        }
      }
      if (!p) return notFound('Project not found');
      const arch = await getArchitecture(p.id);
      try {
        const { detectFFIBridges, normalizeCodeNode } = await import('../../codegraph/polyglot.ts');
        const allNodes = arch.nodes || [];
        const normalized = allNodes.map(function (n) {
          return normalizeCodeNode(n);
        });
        if (normalized.length > 0) {
          const ffiBridges = detectFFIBridges(normalized);
          if (ffiBridges.length > 0) {
            (arch as unknown as Record<string, unknown>).ffiBridges = ffiBridges;
          }
        }
      } catch { /* polyglot */ }
      return json(arch);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/codegraph\/trace$/,
    handler: async (req) => {
      const body = await req.json() as { from: string; to: string; project: string };
      if (!body.from || !body.project) return err('from and project are required', 400);
      const { getProject, tracePath } = await import('../../codegraph/graph.ts');
      const p = await getProject(body.project);
      if (!p) return notFound('Project not found');
      const trace = await tracePath(p.id, body.from, { direction: 'both' });
      const pathNodes = [
        body.from,
        ...trace.map(function (t) {
          return t.node.name;
        }),
      ];
      return json({ paths: [pathNodes] });
    },
  },
];
