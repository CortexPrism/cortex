export interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  version: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PromptRun {
  id: string;
  templateId: string;
  model: string;
  input: string;
  output: string;
  score?: number;
  createdAt: string;
}

const templates = new Map<string, PromptTemplate>();
const runs: PromptRun[] = [];
const MAX_RUNS = 100;

let promptCounter = 0;

export function createPromptTemplate(
  name: string,
  content: string,
  tags: string[] = [],
): PromptTemplate {
  const id = `prompt_${++promptCounter}_${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  const tpl: PromptTemplate = {
    id,
    name,
    content,
    version: 1,
    tags,
    createdAt: now,
    updatedAt: now,
  };
  templates.set(id, tpl);
  return tpl;
}

export function updatePromptTemplate(id: string, content: string): PromptTemplate | null {
  const tpl = templates.get(id);
  if (!tpl) return null;
  tpl.content = content;
  tpl.version++;
  tpl.updatedAt = new Date().toISOString();
  return tpl;
}

export function getPromptTemplate(id: string): PromptTemplate | undefined {
  return templates.get(id);
}

export function listPromptTemplates(): PromptTemplate[] {
  return Array.from(templates.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function recordPromptRun(
  templateId: string,
  model: string,
  input: string,
  output: string,
  score?: number,
): PromptRun {
  const run: PromptRun = {
    id: `run_${Date.now().toString(36)}`,
    templateId,
    model,
    input: input.slice(0, 500),
    output: output.slice(0, 1000),
    score,
    createdAt: new Date().toISOString(),
  };
  runs.push(run);
  while (runs.length > MAX_RUNS) runs.shift();
  return run;
}

export function listPromptRuns(templateId?: string, limit = 20): PromptRun[] {
  const filtered = templateId ? runs.filter((r) => r.templateId === templateId) : runs;
  return filtered.slice(-limit).reverse();
}
