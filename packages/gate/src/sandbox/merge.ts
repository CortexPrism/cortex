/**
 * Three-way merge for background orchestration change bundles.
 * Merges child changes into the parent workspace by diffing against a base snapshot.
 */

export interface MergeFileEntry {
  path: string;
  content: string;
  status: 'clean' | 'conflict' | 'skipped_parent_only' | 'skipped_child_only';
}

export interface MergeConflict {
  path: string;
  parentContent: string;
  childContent: string;
  mergedContent: string;
}

export interface MergeResult {
  merged: MergeFileEntry[];
  conflicts: MergeConflict[];
  stats: {
    clean: number;
    conflicts: number;
    skipped: number;
  };
}

export interface ChangeBundleFile {
  path: string;
  content?: string;
  hash?: string;
}

export function threeWayMerge(
  baseFiles: ChangeBundleFile[],
  childChanges: ChangeBundleFile[],
  parentFiles?: ChangeBundleFile[],
): MergeResult {
  const baseMap = new Map(baseFiles.map((f) => [f.path, f]));
  const childMap = new Map(childChanges.map((f) => [f.path, f]));
  const parentMap = parentFiles
    ? new Map(parentFiles.map((f) => [f.path, f]))
    : new Map(baseFiles.map((f) => [f.path, f]));

  const merged: MergeFileEntry[] = [];
  const conflicts: MergeConflict[] = [];
  let clean = 0;
  let conflictCount = 0;
  let skipped = 0;

  const allPaths = new Set([...baseMap.keys(), ...childMap.keys()]);

  for (const filePath of allPaths) {
    const base = baseMap.get(filePath);
    const child = childMap.get(filePath);
    const parent = parentMap.has(filePath) ? parentMap.get(filePath) : base;

    if (!child) {
      // File only in base (child didn't touch it) — keep parent version
      if (parent && parent.content !== undefined) {
        merged.push({
          path: filePath,
          content: parent.content,
          status: 'skipped_child_only',
        });
      }
      skipped++;
      continue;
    }

    // Child wants to delete the file
    if (child.content === undefined) {
      if (!parent || parent.content === undefined) {
        // Already deleted in parent — clean
        merged.push({ path: filePath, content: '', status: 'clean' });
        clean++;
      } else if (parent.hash === base?.hash) {
        // Parent unchanged since base — clean delete
        merged.push({ path: filePath, content: '', status: 'clean' });
        clean++;
      } else {
        // Parent changed since base — conflict
        const conflictEntry: MergeConflict = {
          path: filePath,
          parentContent: parent.content ?? '',
          childContent: '',
          mergedContent: `<<<<<<< parent\n${
            parent.content ?? ''
          }\n=======\n<< deleted by child >>\n>>>>>>> child`,
        };
        conflicts.push(conflictEntry);
        merged.push({
          path: filePath,
          content: conflictEntry.mergedContent,
          status: 'conflict',
        });
        conflictCount++;
      }
      continue;
    }

    // Child adds or modifies the file
    if (!parent || parent.content === undefined) {
      // New file — clean apply
      merged.push({ path: filePath, content: child.content, status: 'clean' });
      clean++;
      continue;
    }

    if (parent.hash === base?.hash) {
      // Parent unchanged since base — clean apply child version
      merged.push({ path: filePath, content: child.content, status: 'clean' });
      clean++;
    } else if (child.hash === parent.hash) {
      // Both made same change — clean
      merged.push({ path: filePath, content: child.content, status: 'clean' });
      clean++;
    } else {
      // Both changed — conflict
      const conflictEntry: MergeConflict = {
        path: filePath,
        parentContent: parent.content,
        childContent: child.content,
        mergedContent:
          `<<<<<<< parent\n${parent.content}\n=======\n${child.content}\n>>>>>>> child`,
      };
      conflicts.push(conflictEntry);
      merged.push({
        path: filePath,
        content: conflictEntry.mergedContent,
        status: 'conflict',
      });
      conflictCount++;
    }
  }

  return { merged, conflicts, stats: { clean, conflicts: conflictCount, skipped } };
}
