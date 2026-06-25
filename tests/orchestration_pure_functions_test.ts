/**
 * Tests for background orchestration pure functions — merge, patch, glob, status checks.
 * These test pure logic that does not require database setup.
 */
import { assert, assertEquals } from '@std/assert';
import { threeWayMerge } from '../packages/gate/src/sandbox/merge.ts';
import type { ChangeBundleFile, MergeFileEntry } from '../packages/gate/src/sandbox/merge.ts';

Deno.test('threeWayMerge: clean apply when parent unchanged', () => {
  const base: ChangeBundleFile[] = [
    { path: 'src/a.ts', content: 'base content A', hash: 'abc' },
    { path: 'src/b.ts', content: 'base content B', hash: 'def' },
  ];
  const child: ChangeBundleFile[] = [
    { path: 'src/a.ts', content: 'child changed A', hash: 'ghi' },
  ];
  const parent: ChangeBundleFile[] = [
    { path: 'src/a.ts', content: 'base content A', hash: 'abc' },
    { path: 'src/b.ts', content: 'base content B', hash: 'def' },
  ];

  const result = threeWayMerge(base, child, parent);

  assertEquals(result.stats.clean, 1);
  assertEquals(result.stats.conflicts, 0);
  assertEquals(result.stats.skipped, 1);
  assertEquals(result.conflicts.length, 0);
  assertEquals(result.merged.length, 2);

  const applied = result.merged.find((f: MergeFileEntry) => f.path === 'src/a.ts')!;
  assertEquals(applied.content, 'child changed A');
  assertEquals(applied.status, 'clean');
});

Deno.test('threeWayMerge: conflict when both parent and child changed', () => {
  const base: ChangeBundleFile[] = [
    { path: 'src/a.ts', content: 'base', hash: 'b1' },
  ];
  const child: ChangeBundleFile[] = [
    { path: 'src/a.ts', content: 'child version', hash: 'c1' },
  ];
  const parentFiles: ChangeBundleFile[] = [
    { path: 'src/a.ts', content: 'parent version', hash: 'p1' },
  ];

  const result = threeWayMerge(base, child, parentFiles);

  assertEquals(result.stats.clean, 0);
  assertEquals(result.stats.conflicts, 1);
  assertEquals(result.stats.skipped, 0);
  assertEquals(result.conflicts.length, 1);
  assertEquals(result.conflicts[0].path, 'src/a.ts');
  assert(result.conflicts[0].mergedContent.includes('<<<<<<< parent'));
  assert(result.conflicts[0].mergedContent.includes('>>>>>>> child'));
});

Deno.test('threeWayMerge: clean delete when parent unchanged since base', () => {
  const base: ChangeBundleFile[] = [
    { path: 'src/old.ts', content: 'old file', hash: 'old1' },
  ];
  const child: ChangeBundleFile[] = [
    { path: 'src/old.ts', content: undefined },
  ];
  const parent: ChangeBundleFile[] = [
    { path: 'src/old.ts', content: 'old file', hash: 'old1' },
  ];

  const result = threeWayMerge(base, child, parent);

  assertEquals(result.stats.clean, 1);
  assertEquals(result.stats.conflicts, 0);
  assertEquals(result.conflicts.length, 0);
});

Deno.test('threeWayMerge: conflict when parent changed but child deletes', () => {
  const base: ChangeBundleFile[] = [
    { path: 'src/file.ts', content: 'base', hash: 'b1' },
  ];
  const child: ChangeBundleFile[] = [
    { path: 'src/file.ts', content: undefined },
  ];
  const parent: ChangeBundleFile[] = [
    { path: 'src/file.ts', content: 'parent modified', hash: 'p2' },
  ];

  const result = threeWayMerge(base, child, parent);

  assertEquals(result.stats.clean, 0);
  assertEquals(result.stats.conflicts, 1);
  assertEquals(result.stats.skipped, 0);
});

Deno.test('threeWayMerge: new file from child applies cleanly', () => {
  const base: ChangeBundleFile[] = [];
  const child: ChangeBundleFile[] = [
    { path: 'src/new.ts', content: 'new file content', hash: 'n1' },
  ];
  const parent: ChangeBundleFile[] = [];

  const result = threeWayMerge(base, child, parent);

  assertEquals(result.stats.clean, 1);
  assertEquals(result.stats.conflicts, 0);
  assertEquals(result.merged[0].path, 'src/new.ts');
  assertEquals(result.merged[0].content, 'new file content');
});

Deno.test('threeWayMerge: both made same change resolves cleanly', () => {
  const base: ChangeBundleFile[] = [
    { path: 'src/same.ts', content: 'original', hash: 'o1' },
  ];
  const child: ChangeBundleFile[] = [
    { path: 'src/same.ts', content: 'same change', hash: 's1' },
  ];
  const parent: ChangeBundleFile[] = [
    { path: 'src/same.ts', content: 'same change', hash: 's1' },
  ];

  const result = threeWayMerge(base, child, parent);

  assertEquals(result.stats.clean, 1);
  assertEquals(result.stats.conflicts, 0);
});

Deno.test('isTerminalStatus: recognizes all terminal statuses', () => {
  const isTerminalStatus = (status: string): boolean =>
    ['completed', 'failed', 'cancelled', 'timed_out', 'ready_for_apply'].includes(status);

  assertEquals(isTerminalStatus('completed'), true);
  assertEquals(isTerminalStatus('failed'), true);
  assertEquals(isTerminalStatus('cancelled'), true);
  assertEquals(isTerminalStatus('timed_out'), true);
  assertEquals(isTerminalStatus('ready_for_apply'), true);
  assertEquals(isTerminalStatus('running'), false);
  assertEquals(isTerminalStatus('queued'), false);
  assertEquals(isTerminalStatus('consumed'), false);
});

Deno.test('globToRegex: converts glob patterns correctly', () => {
  const globToRegex = (pattern: string): RegExp => {
    let re = '';
    for (let i = 0; i < pattern.length; i++) {
      const ch = pattern[i];
      if (ch === '*') {
        if (pattern[i + 1] === '*') {
          if (pattern[i + 2] === '/' || pattern[i + 2] === '\\') {
            re += '(?:.*\\/)?';
            i += 2;
          } else {
            re += '.*';
            i += 1;
          }
        } else {
          re += '[^/]*';
        }
      } else if (ch === '?') {
        re += '[^/]';
      } else if (ch === '.') {
        re += '\\.';
      } else if (ch === '/') {
        re += '\\/';
      } else {
        re += ch;
      }
    }
    return new RegExp('^' + re + '$');
  };

  assert(globToRegex('src/**/*.ts').test('src/foo/bar/baz.ts'));
  assert(!globToRegex('src/**/*.ts').test('test/foo.ts'));
  assert(globToRegex('*.ts').test('file.ts'));
  assert(!globToRegex('*.ts').test('src/file.ts'));
  assert(globToRegex('src/**').test('src/a/b'));
  assert(!globToRegex('src/**').test('test/a/b'));
  assert(globToRegex('src/?.*').test('src/a.ts'));
  assert(!globToRegex('src/?.*').test('src/ab.ts'));
});

Deno.test('matchGlob: matches file paths against glob patterns', () => {
  const matchGlob = (pattern: string, filePath: string): boolean => {
    let re = '';
    for (let i = 0; i < pattern.length; i++) {
      const ch = pattern[i];
      if (ch === '*') {
        if (pattern[i + 1] === '*') {
          if (pattern[i + 2] === '/' || pattern[i + 2] === '\\') {
            re += '(?:.*\\/)?';
            i += 2;
          } else {
            re += '.*';
            i += 1;
          }
        } else {
          re += '[^/]*';
        }
      } else if (ch === '?') {
        re += '[^/]';
      } else if (ch === '.') {
        re += '\\.';
      } else if (ch === '/') {
        re += '\\/';
      } else {
        re += ch;
      }
    }
    return new RegExp('^' + re + '$').test(filePath);
  };

  assert(matchGlob('src/**/*.ts', 'src/lib/utils.ts'));
  assert(matchGlob('src/**/*.ts', 'src/index.ts'));
  assert(!matchGlob('src/**/*.ts', 'lib/utils.ts'));
  assert(matchGlob('*.json', 'package.json'));
  assert(!matchGlob('*.json', 'src/data.json'));
  assert(matchGlob('src/*.test.ts', 'src/orchestration.test.ts'));
});

Deno.test('patch apply: applies simple unified diff', () => {
  const original = 'line1\nline2\nline3\nline4';
  const patch = `@@ -1,4 +1,5 @@
 line1
 line2
+inserted
 line3
 line4`;
  const result = applyPatch(original, patch);
  assertEquals(result, 'line1\nline2\ninserted\nline3\nline4');
});

Deno.test('patch apply: handles context and add-only hunks', () => {
  const original = 'hello\nworld';
  const patch = `@@ -1,2 +1,3 @@
 hello
 world
+!`;
  const result = applyPatch(original, patch);
  assertEquals(result, 'hello\nworld\n!');
});

Deno.test('patch apply: handles delete-only hunks', () => {
  const original = 'keep\nremove\nkeep2';
  const patch = `@@ -1,3 +1,2 @@
 keep
-remove
 keep2`;
  const result = applyPatch(original, patch);
  assertEquals(result, 'keep\nkeep2');
});

function parseUnifiedPatch(
  patch: string,
): Array<{ srcStart: number; actions: Array<{ type: string; line: string }> }> {
  const hunks: Array<{ srcStart: number; actions: Array<{ type: string; line: string }> }> = [];
  let currentHunk: { srcStart: number; actions: Array<{ type: string; line: string }> } | null =
    null;

  for (const line of patch.split('\n')) {
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      if (currentHunk) hunks.push(currentHunk);
      currentHunk = { srcStart: parseInt(hunkMatch[1], 10), actions: [] };
    } else if (currentHunk) {
      if (line.startsWith(' ')) {
        currentHunk.actions.push({ type: 'context', line: line.slice(1) });
      } else if (line.startsWith('-')) {
        currentHunk.actions.push({ type: 'delete', line: line.slice(1) });
      } else if (line.startsWith('+')) {
        currentHunk.actions.push({ type: 'add', line: line.slice(1) });
      }
    }
  }

  if (currentHunk) hunks.push(currentHunk);
  return hunks;
}

function applyPatch(original: string, patch: string): string {
  const lines = original.split('\n');
  const hunks = parseUnifiedPatch(patch);

  for (const hunk of hunks) {
    let srcLine = hunk.srcStart - 1;
    const result: string[] = [];

    for (const action of hunk.actions) {
      if (action.type === 'context') {
        result.push(lines[srcLine] ?? '');
        srcLine++;
      } else if (action.type === 'delete') {
        srcLine++;
      } else if (action.type === 'add') {
        result.push(action.line);
      }
    }

    const after = lines.slice(srcLine);
    lines.length = hunk.srcStart - 1;
    lines.push(...result, ...after);
  }

  return lines.join('\n');
}

Deno.test('parseCsv: splits comma-separated values', () => {
  const parseCsv = (value: unknown): string[] => {
    if (!value) return [];
    return String(value).split(',').map((s) => s.trim()).filter(Boolean);
  };

  assertEquals(parseCsv('a, b, c'), ['a', 'b', 'c']);
  assertEquals(parseCsv('single'), ['single']);
  assertEquals(parseCsv(''), []);
  assertEquals(parseCsv(null), []);
  assertEquals(parseCsv(undefined), []);
  assertEquals(parseCsv('a,,b'), ['a', 'b']);
});
