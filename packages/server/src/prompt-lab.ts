export interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  version: number;
  tags: string[];
  variables: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PromptRun {
  id: string;
  templateId: string;
  abTestId?: string;
  variant?: 'A' | 'B';
  model: string;
  input: string;
  output: string;
  score?: number;
  latencyMs?: number;
  tokensUsed?: number;
  createdAt: string;
}

export interface ABTest {
  id: string;
  name: string;
  templateId: string;
  variantA: string;
  variantB: string;
  status: 'running' | 'completed' | 'paused';
  createdAt: string;
  updatedAt: string;
}

export interface ABTestStats {
  abTestId: string;
  variantA: { runs: number; avgScore: number; avgLatency: number; avgTokens: number };
  variantB: { runs: number; avgScore: number; avgLatency: number; avgTokens: number };
  winner: 'A' | 'B' | 'tie' | null;
  confidence: number;
}

export interface PromptGenRequest {
  task: string;
  role?: string;
  tone?: string;
  style?: string;
  length?: string;
  constraints?: string[];
  examples?: string[];
  baseTemplate?: string;
}

export interface PromptVariation {
  content: string;
  rationale: string;
  expectedStrength: string;
}

const templates = new Map<string, PromptTemplate>();
const runs: PromptRun[] = [];
const abTests = new Map<string, ABTest>();
const MAX_RUNS = 500;

let promptCounter = 0;

export function extractVariables(content: string): string[] {
  const matches = content.match(/\{\{(\w+)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

export function interpolateTemplate(content: string, vars: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

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
    variables: extractVariables(content),
    createdAt: now,
    updatedAt: now,
  };
  templates.set(id, tpl);
  return tpl;
}

export function updatePromptTemplate(
  id: string,
  content: string,
  name?: string,
  tags?: string[],
): PromptTemplate | null {
  const tpl = templates.get(id);
  if (!tpl) return null;
  tpl.content = content;
  tpl.version++;
  tpl.variables = extractVariables(content);
  if (name !== undefined) tpl.name = name;
  if (tags !== undefined) tpl.tags = tags;
  tpl.updatedAt = new Date().toISOString();
  return tpl;
}

export function deletePromptTemplate(id: string): boolean {
  return templates.delete(id);
}

export function getPromptTemplate(id: string): PromptTemplate | undefined {
  return templates.get(id);
}

export function listPromptTemplates(tag?: string): PromptTemplate[] {
  const all = Array.from(templates.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (tag) return all.filter((t) => t.tags.includes(tag));
  return all;
}

export function recordPromptRun(
  templateId: string,
  model: string,
  input: string,
  output: string,
  score?: number,
  opts?: { abTestId?: string; variant?: 'A' | 'B'; latencyMs?: number; tokensUsed?: number },
): PromptRun {
  const run: PromptRun = {
    id: `run_${Date.now().toString(36)}`,
    templateId,
    abTestId: opts?.abTestId,
    variant: opts?.variant,
    model,
    input: input.slice(0, 1000),
    output: output.slice(0, 4000),
    score,
    latencyMs: opts?.latencyMs,
    tokensUsed: opts?.tokensUsed,
    createdAt: new Date().toISOString(),
  };
  runs.push(run);
  while (runs.length > MAX_RUNS) runs.shift();
  return run;
}

export function listPromptRuns(
  templateId?: string,
  limit = 50,
  abTestId?: string,
): PromptRun[] {
  let filtered = runs;
  if (templateId) filtered = filtered.filter((r) => r.templateId === templateId);
  if (abTestId) filtered = filtered.filter((r) => r.abTestId === abTestId);
  return filtered.slice(-limit).reverse();
}

export function createABTest(
  name: string,
  templateId: string,
  variantA: string,
  variantB: string,
): ABTest | null {
  if (!templates.has(templateId)) return null;
  const id = `ab_${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  const test: ABTest = {
    id,
    name,
    templateId,
    variantA,
    variantB,
    status: 'running',
    createdAt: now,
    updatedAt: now,
  };
  abTests.set(id, test);
  return test;
}

export function updateABTestStatus(
  id: string,
  status: 'running' | 'completed' | 'paused',
): ABTest | null {
  const test = abTests.get(id);
  if (!test) return null;
  test.status = status;
  test.updatedAt = new Date().toISOString();
  return test;
}

export function getABTest(id: string): ABTest | undefined {
  return abTests.get(id);
}

export function listABTests(templateId?: string): ABTest[] {
  const all = Array.from(abTests.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (templateId) return all.filter((t) => t.templateId === templateId);
  return all;
}

export function getABTestStats(abTestId: string): ABTestStats | null {
  const test = abTests.get(abTestId);
  if (!test) return null;
  const testRuns = runs.filter((r) => r.abTestId === abTestId);

  const aRuns = testRuns.filter((r) => r.variant === 'A' && r.score !== undefined);
  const bRuns = testRuns.filter((r) => r.variant === 'B' && r.score !== undefined);

  const aScores = aRuns.map((r) => r.score!);
  const bScores = bRuns.map((r) => r.score!);

  const aAvgScore = aScores.length ? aScores.reduce((s, v) => s + v, 0) / aScores.length : 0;
  const bAvgScore = bScores.length ? bScores.reduce((s, v) => s + v, 0) / bScores.length : 0;

  const aLatencies = testRuns.filter((r) => r.variant === 'A' && r.latencyMs !== undefined).map((r) => r.latencyMs!);
  const bLatencies = testRuns.filter((r) => r.variant === 'B' && r.latencyMs !== undefined).map((r) => r.latencyMs!);
  const aAvgLatency = aLatencies.length ? aLatencies.reduce((s, v) => s + v, 0) / aLatencies.length : 0;
  const bAvgLatency = bLatencies.length ? bLatencies.reduce((s, v) => s + v, 0) / bLatencies.length : 0;

  const aTokens = testRuns.filter((r) => r.variant === 'A' && r.tokensUsed !== undefined).map((r) => r.tokensUsed!);
  const bTokens = testRuns.filter((r) => r.variant === 'B' && r.tokensUsed !== undefined).map((r) => r.tokensUsed!);
  const aAvgTokens = aTokens.length ? aTokens.reduce((s, v) => s + v, 0) / aTokens.length : 0;
  const bAvgTokens = bTokens.length ? bTokens.reduce((s, v) => s + v, 0) / bTokens.length : 0;

  let winner: 'A' | 'B' | 'tie' | null = null;
  let confidence = 0;
  if (aRuns.length >= 2 && bRuns.length >= 2) {
    const diff = bAvgScore - aAvgScore;
    const maxScore = Math.max(...aScores, ...bScores);
    const normalized = maxScore > 0 ? Math.abs(diff) / maxScore : 0;
    if (Math.abs(diff) < 0.01) {
      winner = 'tie';
      confidence = 0;
    } else {
      winner = diff > 0 ? 'B' : 'A';
      confidence = Math.min(normalized, 1);
    }
  }

  return {
    abTestId,
    variantA: { runs: aRuns.length, avgScore: aAvgScore, avgLatency: aAvgLatency, avgTokens: aAvgTokens },
    variantB: { runs: bRuns.length, avgScore: bAvgScore, avgLatency: bAvgLatency, avgTokens: bAvgTokens },
    winner,
    confidence,
  };
}

export function generatePromptVariations(
  content: string,
  count: number,
): PromptVariation[] {
  const variations: PromptVariation[] = [];
  const strategies = [
    {
      name: 'restructure',
      apply: (c: string) => {
        const lines = c.split('\n').filter((l) => l.trim());
        if (lines.length <= 1) return c;
        const last = lines.pop()!;
        return [last, ...lines].join('\n');
      },
      rationale: 'Lead with the strongest instruction first for better attention',
      strength: 'Improved instruction prominence',
    },
    {
      name: 'clarity',
      apply: (c: string) => c
        .replace(/please|kindly|if you would/gi, '')
        .replace(/\s+/g, ' ')
        .trim(),
      rationale: 'Removed polite filler words for direct, authoritative tone',
      strength: 'More concise and directive',
    },
    {
      name: 'specificity',
      apply: (c: string) => {
        if (!c.includes('example')) {
          return c + '\n\nProvide a concrete example in your response.';
        }
        return c;
      },
      rationale: 'Added explicit request for examples to ground responses',
      strength: 'Higher specificity and concreteness',
    },
    {
      name: 'format',
      apply: (c: string) => {
        if (!c.includes('format') && !c.includes('structure') && !c.includes('JSON')) {
          return c + '\n\nFormat your response as a structured list with clear headings.';
        }
        return c;
      },
      rationale: 'Added output format guidance for structured responses',
      strength: 'Better output structure and parseability',
    },
    {
      name: 'persona',
      apply: (c: string) => {
        const prefix = 'You are an expert in this domain. ';
        return c.startsWith(prefix) ? c : prefix + c.charAt(0).toLowerCase() + c.slice(1);
      },
      rationale: 'Added expert persona framing to elevate response quality',
      strength: 'Higher quality through expert role priming',
    },
  ];

  const shuffled = [...strategies].sort(() => Math.random() - 0.5);
  const count_ = Math.min(count, shuffled.length);

  for (let i = 0; i < count_; i++) {
    const s = shuffled[i];
    variations.push({
      content: s.apply(content),
      rationale: s.rationale,
      expectedStrength: s.strength,
    });
  }

  return variations;
}

export function generatePromptFromRequest(req: PromptGenRequest): string {
  const parts: string[] = [];

  if (req.role) {
    parts.push(`You are ${req.role}.`);
  }

  if (req.tone || req.style) {
    const toneMap: Record<string, string> = {
      professional: 'Use a professional and formal tone.',
      casual: 'Use a casual and conversational tone.',
      technical: 'Use precise technical language.',
      friendly: 'Use a warm and friendly tone.',
      authoritative: 'Speak with authority and confidence.',
    };
    const styleMap: Record<string, string> = {
      concise: 'Be concise and to the point.',
      detailed: 'Provide thorough and detailed responses.',
      creative: 'Be creative and think outside the box.',
      analytical: 'Take an analytical, data-driven approach.',
      stepwise: 'Break down your response into clear steps.',
    };
    if (req.tone && toneMap[req.tone]) parts.push(toneMap[req.tone]);
    if (req.style && styleMap[req.style]) parts.push(styleMap[req.style]);
  }

  if (req.length) {
    parts.push(`Keep your response ${req.length}.`);
  }

  parts.push('');

  if (req.baseTemplate) {
    parts.push(req.baseTemplate);
  } else {
    parts.push(req.task);
  }

  if (req.constraints && req.constraints.length > 0) {
    parts.push('');
    parts.push('Constraints:');
    for (const c of req.constraints) {
      parts.push(`- ${c}`);
    }
  }

  if (req.examples && req.examples.length > 0) {
    parts.push('');
    parts.push('Examples:');
    for (const e of req.examples) {
      parts.push(`- ${e}`);
    }
  }

  return parts.join('\n');
}

export function getPromptStats(): {
  templateCount: number;
  runCount: number;
  abTestCount: number;
} {
  return {
    templateCount: templates.size,
    runCount: runs.length,
    abTestCount: abTests.size,
  };
}
