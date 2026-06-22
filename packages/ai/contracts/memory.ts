export interface IEpisodicEntry {
  id: string;
  session_id: string | null;
  summary: string;
  topics: string[];
  entities: string[];
  start_time: string;
  importance: number;
  decay_score: number;
  created_at: string;
}

export interface ISemanticEntry {
  id: string;
  content: string;
  summary: string | null;
  category: string;
  tags: string[];
  importance: number;
  decay_score: number;
  created_at: string;
}

export interface IMemoryHit {
  id: string;
  type: 'episodic' | 'semantic';
  text: string;
  score: number;
  created_at: string;
  sessionId?: string | null;
  entities?: string[];
  topics?: string[];
  tags?: string[];
  category?: string;
  decayScore?: number;
  accessCount?: number;
}

export interface IMemoryStore {
  write(entry: IEpisodicEntry | ISemanticEntry): Promise<string>;
  query(embedding?: number[], k?: number): Promise<IMemoryHit[]>;
  delete(id: string): Promise<boolean>;
}

export interface IEpisodicStore {
  write(entry: IEpisodicEntry): Promise<string>;
  query(embedding?: number[], k?: number): Promise<IMemoryHit[]>;
  getRecent(limit?: number): Promise<IEpisodicEntry[]>;
}

export interface ISemanticStore {
  write(entry: ISemanticEntry): Promise<string>;
  query(embedding?: number[], k?: number): Promise<IMemoryHit[]>;
  search(text: string, k?: number): Promise<IMemoryHit[]>;
}

export interface IGraphStore {
  addEntity(name: string, type: string, description?: string, metadata?: Record<string, unknown>): Promise<string>;
  addRelation(sourceName: string, sourceType: string, targetName: string, targetType: string, relation: string, strength?: number, context?: string): Promise<string>;
  getGraph(entityName?: string, depth?: number, limit?: number): Promise<{ nodes: unknown[]; edges: unknown[] }>;
  traverse(entity: string, depth?: number): Promise<unknown[]>;
}
