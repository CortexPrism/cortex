export interface ISkillEntry {
  name: string;
  description: string;
  content: string;
  origin: 'core' | 'human';
  lifecycle: 'stable' | 'experimental' | 'deprecated';
  bindings?: Record<string, unknown>;
  dependencies?: string[];
  created_at: string;
  updated_at: string;
}

export interface ISkillStore {
  findMatching(input: string, k: number, embedder?: unknown): Promise<ISkillEntry[]>;
  store(skill: ISkillEntry): Promise<string>;
  delete(name: string): Promise<boolean>;
  list(origin?: 'core' | 'human', lifecycle?: 'stable' | 'experimental' | 'deprecated'): Promise<ISkillEntry[]>;
  get(name: string): Promise<ISkillEntry | undefined>;
  stats(): Promise<Record<string, number>>;
  health(name: string): Promise<Record<string, number> | null>;
}
