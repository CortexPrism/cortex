import { listTriggers, handleTriggerEvent } from './manager.ts';
import type { TriggerEvent } from './types.ts';

const watchers: Map<string, { watcher: Deno.FsWatcher; debounceTimer: ReturnType<typeof setTimeout> | null; changedFiles: Set<string> }> = new Map();

export interface WatcherJobCreator {
  createJob(agentId: string, prompt: string): Promise<unknown>;
}

let jobCreator: WatcherJobCreator | null = null;

export function setWatcherJobCreator(creator: WatcherJobCreator): void {
  jobCreator = creator;
}

export async function startWatchers(): Promise<void> {
  const fsTriggers = listTriggers().filter((t) => t.enabled && t.source === 'watcher' && t.watcher);

  for (const trigger of fsTriggers) {
    await startWatcher(trigger.name);
  }
}

async function startWatcher(triggerName: string): Promise<void> {
  if (watchers.has(triggerName)) return;

  const trigger = listTriggers().find((t) => t.name === triggerName);
  if (!trigger?.watcher) return;

  const { paths, patterns, events, debounceMs } = trigger.watcher;

  const watchPaths = paths.filter((p) => {
    try {
      Deno.statSync(p);
      return true;
    } catch {
      console.error(`[triggers:watcher] Path not found: ${p}`);
      return false;
    }
  });

  if (watchPaths.length === 0) return;

  const watcher = Deno.watchFs(watchPaths, { recursive: trigger.watcher.recursive });

  const entry = {
    watcher,
    debounceTimer: null as ReturnType<typeof setTimeout> | null,
    changedFiles: new Set<string>(),
  };

  watchers.set(triggerName, entry);

  (async () => {
    for await (const fsEvent of watcher) {
      const kind = fsEvent.kind as string;
      if (events.length > 0 && !(events as string[]).includes(kind)) continue;

      for (const path of fsEvent.paths) {
        const filename = path.split('/').pop() ?? '';

        if (patterns && patterns.length > 0) {
          const matches = patterns.some((pattern) => {
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
            return regex.test(filename);
          });
          if (!matches) continue;
        }

        entry.changedFiles.add(path);
      }

      if (entry.debounceTimer) clearTimeout(entry.debounceTimer);

      entry.debounceTimer = setTimeout(async () => {
        const files = [...entry.changedFiles];
        entry.changedFiles.clear();

        const creator = jobCreator;
        if (files.length === 0 || !creator) return;

        const event: TriggerEvent = {
          triggerName,
          source: 'watcher',
          timestamp: new Date(),
          data: {
            changed_files: files,
            path: files[0] ?? '',
          },
        };

        await handleTriggerEvent(event, (agentId, prompt) =>
          creator.createJob(agentId, prompt),
        );
      }, debounceMs) as unknown as ReturnType<typeof setTimeout>;
    }
  })().catch((e) => {
    console.error(`[triggers:watcher] Error watching ${triggerName}: ${(e as Error).message}`);
  });
}

export function stopWatcher(triggerName: string): void {
  const entry = watchers.get(triggerName);
  if (!entry) return;

  if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
  try { entry.watcher.close(); } catch { /* ignore */ }
  watchers.delete(triggerName);
}

export function stopAllWatchers(): void {
  for (const name of watchers.keys()) {
    stopWatcher(name);
  }
}
