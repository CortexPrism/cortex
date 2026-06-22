import type { BuiltinSkill } from './mod.ts';

export const testCodeReliabilitySkill: BuiltinSkill = {
  name: 'test-code-reliability',
  description:
    'Write tests to catch bugs early and ensure code works. Use when implementing features or fixing bugs.',
  tags: ['development', 'testing', 'quality', 'reliability'],
  difficulty: 'intermediate',
  examples: [
    'Happy path works → add error case tests',
    'Feature works locally → add edge case tests',
    'Fix a bug → add test that would catch it',
  ],
  prerequisites: ['Testing basics'],
  steps: [
    {
      step: 1,
      action: 'Write happy path test',
      description: 'Test normal usage with valid inputs',
    },
    {
      step: 2,
      action: 'Write error case tests',
      description: 'Test each error path with invalid inputs',
    },
    {
      step: 3,
      action: 'Write edge case tests',
      description: 'Test boundary conditions: empty, null, max, min',
    },
    {
      step: 4,
      action: 'Test integration',
      description: 'Verify components work together in real workflows',
    },
    {
      step: 5,
      action: 'Verify all tests pass',
      description: 'Run locally and on CI, ensure reasonable execution time',
    },
  ],
  content: `# Test Code Reliability

Tests are safety nets. Good tests catch problems before users do.

## Test Categories

1. **Happy path** - Normal usage works
2. **Error cases** - Invalid inputs handled
3. **Edge cases** - Boundary conditions work
4. **Integration** - Components work together

## Test Pattern

\`\`\`
1. Arrange: Set up test data
2. Act: Call the function
3. Assert: Check the result
\`\`\`

## Coverage Strategy

| Category | Coverage | Examples |
|----------|----------|----------|
| Happy path | 80%+ | Valid inputs, normal flow |
| Errors | 90%+ | Each error path tested |
| Edges | 70%+ | Empty, null, max, min |
| Integration | 50%+ | Key workflows |

## Checklist

- [ ] Happy path test?
- [ ] Error test for each error type?
- [ ] Edge cases covered?
- [ ] Tests pass locally?
- [ ] Tests pass on CI?
- [ ] Reasonable execution time?`,
};
