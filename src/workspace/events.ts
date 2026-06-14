type FileChangeListener = (event: FileChangeEvent) => void;

export interface FileChangeEvent {
  agentId: string;
  filePath: string;
  action: 'write' | 'delete' | 'rename';
}

const listeners = new Set<FileChangeListener>();

export function onFileChange(listener: FileChangeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitFileChange(event: FileChangeEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch { /* ignore listener errors */ }
  }
}
