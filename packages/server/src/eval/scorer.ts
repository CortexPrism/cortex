import type { EvalDetail, EvalResult } from './types.ts';

export function scoreResponse(output: string, expectedPatterns: string[]): {
  passed: boolean;
  score: number;
  details: EvalDetail[];
} {
  const details: EvalDetail[] = [];
  let matches = 0;

  for (const pattern of expectedPatterns) {
    let pass = false;
    let actual = '';

    if (pattern.startsWith('regex:')) {
      const re = new RegExp(pattern.slice(6), 'i');
      pass = re.test(output);
      actual = pass ? 'matched' : 'no match';
    } else if (pattern.startsWith('contains:')) {
      const needle = pattern.slice(9).toLowerCase();
      pass = output.toLowerCase().includes(needle);
      actual = pass ? 'found' : 'not found';
    } else if (pattern.startsWith('not_contains:')) {
      const needle = pattern.slice(13).toLowerCase();
      pass = !output.toLowerCase().includes(needle);
      actual = pass ? 'correctly absent' : `found forbidden: ${needle}`;
    } else {
      // default: fuzzy contains
      pass = output.toLowerCase().includes(pattern.toLowerCase());
      actual = pass ? 'found' : 'not found';
    }

    if (pass) matches++;
    details.push({
      check: pattern,
      passed: pass,
      expected: pattern,
      actual,
    });
  }

  const score = expectedPatterns.length > 0
    ? matches / expectedPatterns.length
    : (output.length > 10 ? 1.0 : 0.0);

  return {
    passed: expectedPatterns.length === 0
      ? (output.length > 10)
      : matches === expectedPatterns.length,
    score,
    details,
  };
}

export function scoreFileContent(
  content: string,
  shouldContain?: string,
): { passed: boolean; detail: EvalDetail } {
  if (!shouldContain) {
    return {
      passed: true,
      detail: { check: 'file_exists', passed: true, expected: 'file exists', actual: 'found' },
    };
  }

  const passed = content.toLowerCase().includes(shouldContain.toLowerCase());
  return {
    passed,
    detail: {
      check: `file_contains:${shouldContain}`,
      passed,
      expected: shouldContain,
      actual: passed ? 'found' : `content length ${content.length}`,
    },
  };
}

export function checkRegression(
  previous: EvalResult,
  current: EvalResult,
  threshold = 0.1,
): { degraded: boolean; delta: number } {
  const delta = previous.score - current.score;
  return { degraded: delta > threshold, delta };
}
