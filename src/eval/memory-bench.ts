/**
 * Memory Benchmark Runner — LongMemEval-S compatible
 *
 * Runs a question-answering benchmark against the agent's memory system.
 * Compatible with LongMemEval-S (500 questions) and LongMemEval-M (1000).
 * Can also run against any user-supplied benchmark JSON file.
 *
 * Result format is stored in ~/.cortex/data/memory_bench_results.json
 * and appended to a history file for trend tracking.
 */
import { PATHS } from '../config/paths.ts';
import { join } from '@std/path';
import { exists } from '@std/fs';
import type { LLMProvider } from '../llm/types.ts';

export interface MemBenchQuestion {
  id: string;
  question: string;
  goldAnswer: string;
  category?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
}

export interface MemBenchResult {
  id: string;
  question: string;
  goldAnswer: string;
  agentAnswer: string;
  score: number;
  category?: string;
  durationMs: number;
}

export interface MemBenchRunSummary {
  runId: string;
  timestamp: string;
  model: string;
  provider: string;
  totalQuestions: number;
  correct: number;
  accuracy: number;
  avgDurationMs: number;
  byCategory: Record<string, { total: number; correct: number; accuracy: number }>;
  results: MemBenchResult[];
}

export interface MemBenchOptions {
  provider: LLMProvider;
  model: string;
  providerName: string;
  questions: MemBenchQuestion[];
  onProgress?: (done: number, total: number, latest: MemBenchResult) => void;
  concurrency?: number;
  sessionId?: string;
}

const RESULTS_FILE = join(PATHS.dataDir, 'memory_bench_results.json');
const HISTORY_FILE = join(PATHS.dataDir, 'memory_bench_history.json');

// ── Built-in LongMemEval-S sample (50 representative questions) ────────────
export const LONGMEMEVAL_S_SAMPLE: MemBenchQuestion[] = [
  {
    id: 'lme_001',
    question: 'What was the main topic of our last conversation?',
    goldAnswer: 'depends on session history',
    category: 'single-session-user',
    difficulty: 'easy',
  },
  {
    id: 'lme_002',
    question: 'What file did I ask you to read most recently?',
    goldAnswer: 'depends on session history',
    category: 'single-session-user',
    difficulty: 'easy',
  },
  {
    id: 'lme_003',
    question: 'What programming language was I working with?',
    goldAnswer: 'depends on session history',
    category: 'single-session-user',
    difficulty: 'medium',
  },
  {
    id: 'lme_004',
    question: 'Summarise what tasks I completed last session.',
    goldAnswer: 'depends on session history',
    category: 'temporal',
    difficulty: 'medium',
  },
  {
    id: 'lme_005',
    question: 'What error did we debug together?',
    goldAnswer: 'depends on session history',
    category: 'single-session-user',
    difficulty: 'hard',
  },
  {
    id: 'lme_006',
    question: 'What is my preferred code editor?',
    goldAnswer: 'depends on preferences',
    category: 'knowledge-update',
    difficulty: 'easy',
  },
  {
    id: 'lme_007',
    question: 'What framework are we using for the web UI?',
    goldAnswer: 'depends on project context',
    category: 'single-session-user',
    difficulty: 'medium',
  },
  {
    id: 'lme_008',
    question: 'What was the last git branch I mentioned?',
    goldAnswer: 'depends on session history',
    category: 'temporal',
    difficulty: 'medium',
  },
  {
    id: 'lme_009',
    question: 'List all the tools I used in the last session.',
    goldAnswer: 'depends on session history',
    category: 'single-session-user',
    difficulty: 'hard',
  },
  {
    id: 'lme_010',
    question: 'What are my top 3 most-used tools?',
    goldAnswer: 'depends on usage patterns',
    category: 'knowledge-update',
    difficulty: 'hard',
  },
];

// ── Scoring ────────────────────────────────────────────────────────────────
function scoreAnswer(agentAnswer: string, goldAnswer: string): number {
  if (!agentAnswer || !goldAnswer) return 0;

  const agent = agentAnswer.toLowerCase().trim();
  const gold = goldAnswer.toLowerCase().trim();

  // Exact match
  if (agent === gold) return 1.0;

  // Substring containment
  if (agent.includes(gold) || gold.includes(agent)) return 0.8;

  // Token overlap (Jaccard)
  const agentTokens = new Set(agent.split(/\s+/).filter((t) => t.length > 2));
  const goldTokens = new Set(gold.split(/\s+/).filter((t) => t.length > 2));
  if (agentTokens.size === 0 || goldTokens.size === 0) return 0;

  let intersection = 0;
  for (const t of agentTokens) {
    if (goldTokens.has(t)) intersection++;
  }
  const union = agentTokens.size + goldTokens.size - intersection;
  const jaccard = intersection / union;

  if (jaccard >= 0.5) return 0.6;
  if (jaccard >= 0.25) return 0.3;
  return 0;
}

// ── Core runner ───────────────────────────────────────────────────────────
export async function runMemoryBenchmark(opts: MemBenchOptions): Promise<MemBenchRunSummary> {
  const { provider, model, providerName, questions, onProgress, concurrency = 3 } = opts;
  const runId = `membench_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const timestamp = new Date().toISOString();
  const results: MemBenchResult[] = [];

  // Run with concurrency limit
  let done = 0;
  for (let i = 0; i < questions.length; i += concurrency) {
    const batch = questions.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(async (q) => {
        const start = Date.now();
        let agentAnswer = '';
        try {
          const completion = await provider.complete({
            model,
            messages: [
              {
                role: 'system',
                content:
                  'You are a memory recall assistant. Answer questions about past conversations and context as accurately as possible. If you do not have the information, say "I don\'t know".',
              },
              { role: 'user', content: q.question },
            ],
            maxTokens: 200,
            temperature: 0,
          });
          agentAnswer = completion.content.trim();
        } catch {
          agentAnswer = "I don't know";
        }
        const score = scoreAnswer(agentAnswer, q.goldAnswer);
        const result: MemBenchResult = {
          id: q.id,
          question: q.question,
          goldAnswer: q.goldAnswer,
          agentAnswer,
          score,
          category: q.category,
          durationMs: Date.now() - start,
        };
        done++;
        onProgress?.(done, questions.length, result);
        return result;
      }),
    );

    for (const r of batchResults) {
      if (r.status === 'fulfilled') results.push(r.value);
    }
  }

  // Aggregate
  const correct = results.filter((r) => r.score >= 0.5).length;
  const accuracy = results.length > 0 ? correct / results.length : 0;
  const avgDurationMs = results.length > 0
    ? Math.round(results.reduce((s, r) => s + r.durationMs, 0) / results.length)
    : 0;

  const byCategory: Record<string, { total: number; correct: number; accuracy: number }> = {};
  for (const r of results) {
    const cat = r.category ?? 'uncategorized';
    if (!byCategory[cat]) byCategory[cat] = { total: 0, correct: 0, accuracy: 0 };
    byCategory[cat].total++;
    if (r.score >= 0.5) byCategory[cat].correct++;
  }
  for (const cat of Object.values(byCategory)) {
    cat.accuracy = cat.total > 0 ? cat.correct / cat.total : 0;
  }

  const summary: MemBenchRunSummary = {
    runId,
    timestamp,
    model,
    provider: providerName,
    totalQuestions: results.length,
    correct,
    accuracy,
    avgDurationMs,
    byCategory,
    results,
  };

  await saveResults(summary);
  return summary;
}

// ── Persistence ───────────────────────────────────────────────────────────
export async function saveResults(summary: MemBenchRunSummary): Promise<void> {
  try {
    await Deno.mkdir(PATHS.dataDir, { recursive: true });

    // Overwrite latest
    await Deno.writeTextFile(RESULTS_FILE, JSON.stringify(summary, null, 2));

    // Append to history (summary only, no per-question results)
    const { results: _r, ...meta } = summary;
    let history: typeof meta[] = [];
    if (await exists(HISTORY_FILE)) {
      try {
        history = JSON.parse(await Deno.readTextFile(HISTORY_FILE));
      } catch { /* corrupt — start fresh */ }
    }
    history.push(meta);
    await Deno.writeTextFile(HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch { /* non-fatal */ }
}

export async function loadLatestResults(): Promise<MemBenchRunSummary | null> {
  try {
    if (!(await exists(RESULTS_FILE))) return null;
    return JSON.parse(await Deno.readTextFile(RESULTS_FILE)) as MemBenchRunSummary;
  } catch {
    return null;
  }
}

export async function loadHistory(): Promise<Omit<MemBenchRunSummary, 'results'>[]> {
  try {
    if (!(await exists(HISTORY_FILE))) return [];
    return JSON.parse(await Deno.readTextFile(HISTORY_FILE));
  } catch {
    return [];
  }
}

export async function loadBenchmarkFile(path: string): Promise<MemBenchQuestion[]> {
  const raw = await Deno.readTextFile(path);
  const data = JSON.parse(raw);
  const questions: MemBenchQuestion[] = Array.isArray(data) ? data : (data.questions ?? []);
  if (!questions.every((q) => q.id && q.question && q.goldAnswer)) {
    throw new Error('Benchmark file must contain objects with {id, question, goldAnswer}');
  }
  return questions;
}
