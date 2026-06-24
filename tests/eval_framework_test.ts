/**
 * Tests for the eval framework — scorer, file content scoring, and regression detection.
 *
 * Exercises the real scoring logic used by `cortex eval` against production
 * agent output patterns (code generation, bug fixes, tool sequences).
 */
import { assert, assertEquals } from '@std/assert';
import { checkRegression, scoreFileContent, scoreResponse } from '../src/eval/scorer.ts';
import type { EvalDetail, EvalResult, TaskCategory } from '../src/eval/types.ts';

Deno.test('eval: scoreResponse regex: prefix matches', () => {
  const result = scoreResponse(
    'function add(a: number, b: number): number {\n  return a + b;\n}',
    ['regex:function\\s+add\\s*\\(', 'regex:return a \\+ b'],
  );
  assertEquals(result.passed, true);
  assertEquals(result.score, 1.0);
  assertEquals(result.details.length, 2);
});

Deno.test('eval: scoreResponse regex: case insensitive', () => {
  const result = scoreResponse(
    'ERROR: Failed to connect to database',
    ['regex:error:.+database'],
  );
  assertEquals(result.passed, true);
  assertEquals(result.details[0].passed, true);
});

Deno.test('eval: scoreResponse regex: partial match fails', () => {
  const result = scoreResponse(
    'function foo() { return 1; }',
    ['regex:function\\s+bar'],
  );
  assertEquals(result.passed, false);
  assertEquals(result.score, 0.0);
  assertEquals(result.details[0].actual, 'no match');
});

Deno.test('eval: scoreResponse contains: exact substring match', () => {
  const result = scoreResponse(
    'I will use the file_read tool to examine the source',
    ['contains:file_read', 'contains:examine'],
  );
  assertEquals(result.passed, true);
  assertEquals(result.score, 1.0);
});

Deno.test('eval: scoreResponse contains: case insensitive matching', () => {
  const result = scoreResponse(
    'Using File_Read Tool',
    ['contains:file_read'],
  );
  assertEquals(result.passed, true);
  assertEquals(result.details[0].actual, 'found');
});

Deno.test('eval: scoreResponse contains: missing substring fails', () => {
  const result = scoreResponse(
    'I will use the search tool',
    ['contains:file_write'],
  );
  assertEquals(result.passed, false);
  assertEquals(result.details[0].actual, 'not found');
});

Deno.test('eval: scoreResponse not_contains: correctly absent', () => {
  const result = scoreResponse(
    'Here is the code without any bugs or issues',
    ['not_contains:error', 'not_contains:exception'],
  );
  assertEquals(result.passed, true);
  assertEquals(result.score, 1.0);
});

Deno.test('eval: scoreResponse not_contains: detects forbidden content', () => {
  const result = scoreResponse(
    'There was an error processing the request',
    ['not_contains:error'],
  );
  assertEquals(result.passed, false);
  assertEquals(result.details[0].passed, false);
  assert(result.details[0].actual.includes('forbidden'), 'should report forbidden match');
});

Deno.test('eval: scoreResponse fuzzy default: basic substring', () => {
  const result = scoreResponse(
    'The battle of Hastings occurred in 1066',
    ['Hastings'],
  );
  assertEquals(result.passed, true);
  assertEquals(result.details[0].passed, true);
});

Deno.test('eval: scoreResponse mixed patterns: regex + contains + not_contains', () => {
  const output = `I will refactor the UserService class.
The new implementation uses dependency injection.
No legacy patterns are used.`;

  const result = scoreResponse(output, [
    'regex:refactor\\s+the\\s+\\w+\\s+class',
    'contains:dependency injection',
    'not_contains:deprecated',
  ]);
  assertEquals(result.passed, true);
  assertEquals(result.score, 1.0);
  assertEquals(result.details.length, 3);
  assertEquals(result.details[0].passed, true);
  assertEquals(result.details[1].passed, true);
  assertEquals(result.details[2].passed, true);
});

Deno.test('eval: scoreResponse mixed patterns: one fails drops score', () => {
  const output = 'I will fix the bug in UserService';

  const result = scoreResponse(output, [
    'regex:fix\\s+the\\s+bug',
    'contains:refactor', // this one fails
  ]);
  assertEquals(result.passed, false);
  assertEquals(result.score, 0.5);
});

Deno.test('eval: scoreResponse empty output with patterns fails', () => {
  const result = scoreResponse('', ['contains:something']);
  assertEquals(result.passed, false);
  assertEquals(result.score, 0.0);
});

Deno.test('eval: scoreResponse empty patterns with long output passes', () => {
  const result = scoreResponse('This is a sufficiently long response', []);
  assertEquals(result.passed, true);
  assertEquals(result.score, 1.0);
});

Deno.test('eval: scoreResponse empty patterns with short output fails', () => {
  const result = scoreResponse('Hi', []);
  assertEquals(result.passed, false);
  assertEquals(result.score, 0.0);
});

Deno.test('eval: scoreResponse handles unicode and emoji', () => {
  const result = scoreResponse(
    'The fix resolves the performance issue 🚀 for résumé parsing',
    ['contains:résumé', 'contains:performance'],
  );
  assertEquals(result.passed, true);
  assertEquals(result.score, 1.0);
});

Deno.test('eval: scoreResponse handles multi-line code blocks', () => {
  const output = `\`\`\`typescript
export class UserController {
  async getUser(id: string): Promise<User> {
    return await this.service.findById(id);
  }
}\`\`\``;

  const result = scoreResponse(output, [
    'contains:class UserController',
    'regex:async\\s+getUser\\(\\w+:\\s+string\\)',
    'regex:return await this\\.\\w+\\.findById',
  ]);
  assertEquals(result.passed, true);
});

Deno.test('eval: scoreResponse regex: special characters in pattern', () => {
  const result = scoreResponse(
    'import { assertEquals } from "@std/assert";',
    ['regex:from\\s+"@std/assert"'],
  );
  assertEquals(result.passed, true);
});

// ── File content scoring ────────────────────────────────────────────────────

Deno.test('eval: scoreFileContent without shouldContain passes on any content', () => {
  const result = scoreFileContent('any content', undefined);
  assertEquals(result.passed, true);
  assertEquals(result.detail.passed, true);
  assertEquals(result.detail.check, 'file_exists');
});

Deno.test('eval: scoreFileContent with shouldContain matching', () => {
  const result = scoreFileContent(
    'export function calculateTotal(items: Item[]): number {\n  return items.reduce((sum, i) => sum + i.price, 0);\n}',
    'calculateTotal',
  );
  assertEquals(result.passed, true);
  assertEquals(result.detail.passed, true);
});

Deno.test('eval: scoreFileContent with shouldContain case insensitive', () => {
  const result = scoreFileContent('CALCULATE_TOTAL', 'calculate_total');
  assertEquals(result.passed, true);
});

Deno.test('eval: scoreFileContent with shouldContain missing', () => {
  const result = scoreFileContent('export function foo() {}', 'bar');
  assertEquals(result.passed, false);
  assertEquals(result.detail.passed, false);
  assertEquals(result.detail.check, 'file_contains:bar');
});

Deno.test('eval: scoreFileContent with empty content and shouldContain', () => {
  const result = scoreFileContent('', 'something');
  assertEquals(result.passed, false);
});

// ── Regression detection ────────────────────────────────────────────────────

function makeResult(params: {
  taskId: string;
  category?: string;
  score: number;
  passed: boolean;
}): EvalResult {
  return {
    taskId: params.taskId,
    taskCategory: (params.category as TaskCategory) ?? 'code_generation',
    passed: params.passed,
    score: params.score,
    durationMs: 100,
    tokensUsed: 50,
    costUsd: 0.001,
    toolCallsMade: 0,
    details: [],
  };
}

Deno.test('eval: checkRegression detects score drop beyond threshold', () => {
  const prev = makeResult({ taskId: 'task_1', score: 1.0, passed: true });
  const curr = makeResult({ taskId: 'task_1', score: 0.5, passed: false });
  const result = checkRegression(prev, curr);
  assertEquals(result.degraded, true);
  assertEquals(result.delta, 0.5);
});

Deno.test('eval: checkRegression small drop within threshold is not degraded', () => {
  const prev = makeResult({ taskId: 'task_1', score: 0.95, passed: true });
  const curr = makeResult({ taskId: 'task_1', score: 0.90, passed: true });
  const result = checkRegression(prev, curr);
  assertEquals(result.degraded, false, '0.05 drop within 0.1 threshold');
  assert(Math.abs(result.delta - 0.05) < 0.001, `delta ${result.delta} should be ~0.05`);
});

Deno.test('eval: checkRegression score improvement is not degraded', () => {
  const prev = makeResult({ taskId: 'task_1', score: 0.7, passed: true });
  const curr = makeResult({ taskId: 'task_1', score: 0.9, passed: true });
  const result = checkRegression(prev, curr);
  assertEquals(result.degraded, false);
  assert(Math.abs(result.delta - (-0.2)) < 0.001, `delta ${result.delta} should be ~-0.2`);
});

Deno.test('eval: checkRegression exact threshold boundary', () => {
  const prev = makeResult({ taskId: 'task_1', score: 1.0, passed: true });
  const curr = makeResult({ taskId: 'task_1', score: 0.9, passed: true });
  const result = checkRegression(prev, curr, 0.1);
  assertEquals(result.degraded, false, 'exactly at threshold should not be degraded');
  assert(Math.abs(result.delta - 0.1) < 0.001, `delta ${result.delta} should be ~0.1`);
});

Deno.test('eval: checkRegression just beyond threshold', () => {
  const prev = makeResult({ taskId: 'task_1', score: 1.0, passed: true });
  const curr = makeResult({ taskId: 'task_1', score: 0.89, passed: false });
  const result = checkRegression(prev, curr, 0.1);
  assertEquals(result.degraded, true);
  assert(Math.abs(result.delta - 0.11) < 0.001, `delta ${result.delta} should be ~0.11`);
});

Deno.test('eval: checkRegression custom threshold', () => {
  const prev = makeResult({ taskId: 'task_1', score: 1.0, passed: true });
  const curr = makeResult({ taskId: 'task_1', score: 0.75, passed: true });
  const result = checkRegression(prev, curr, 0.3);
  assertEquals(result.degraded, false, '0.25 drop within 0.3 threshold');
  assertEquals(result.delta, 0.25);
});

// ── Production scenario: eval run with realistic agent outputs ──────────────

Deno.test('eval: realistic agent code generation output passes all checks', () => {
  const output = `I'll create a UserService class with dependency injection.

\`\`\`typescript
export class UserService {
  constructor(private readonly db: Database) {}

  async findById(id: string): Promise<User | null> {
    const result = await this.db.query('SELECT * FROM users WHERE id = ?', [id]);
    return result.rows[0] ?? null;
  }
}
\`\`\`

The class uses constructor injection and handles null cases. No hardcoded secrets are present.`;

  const result = scoreResponse(output, [
    'regex:class\\s+UserService',
    'contains:constructor',
    'not_contains:apiKey',
    'not_contains:password',
    'contains:this.db',
    'regex:return result\\.rows',
  ]);
  assertEquals(result.passed, true);
  assertEquals(result.score, 1.0);
});

Deno.test('eval: realistic agent output with partial failure', () => {
  const output = `I'll fix the bug by adding null checks to the UserService.

Here's the updated code:

\`\`\`typescript
// TODO: add better error handling
async findById(id: string): Promise<User | null> {
  if (!id) return null;
  return await this.db.users.findOne({ id });
}
\`\`\``;

  const result = scoreResponse(output, [
    'contains:null check',
    'regex:class\\s+\\w+', // should fail — no class wrapper in output
    'contains:TODO',
  ]);
  assertEquals(result.passed, false, 'second pattern (class wrapper) fails');
  assertEquals(result.score, 2 / 3);
});

Deno.test('eval: scoreFileContent real-world TypeScript check', () => {
  const content = `import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly jwtService: JwtService,
  ) {}

  async validateToken(token: string): Promise<boolean> {
    try {
      const payload = await this.jwtService.verify(token);
      const user = await this.userRepo.findById(payload.sub);
      return user !== null;
    } catch {
      return false;
    }
  }
}
`;

  const result = scoreFileContent(content, '@Injectable()');
  assertEquals(result.passed, true);
});

Deno.test('eval: scoreFileContent catches missing critical pattern', () => {
  const content = `class AuthService {
  validateToken(token) { return true; }
}`;

  const result = scoreFileContent(content, 'jwtService');
  assertEquals(result.passed, false);
  assert(
    result.detail.actual.startsWith('content length'),
    'should report content length when pattern not found',
  );
});
