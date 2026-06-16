import type { BuiltinSkill } from './mod.ts';

export const diagnoseAgentFailuresSkill: BuiltinSkill = {
  name: 'diagnose-agent-failures',
  description:
    'Systematically troubleshoot when agents hang, timeout, or fail. Use when agent stops responding or returns error.',
  tags: ['debugging', 'diagnostics', 'system', 'troubleshooting'],
  difficulty: 'advanced',
  examples: [
    'Agent hangs → check if database query is slow',
    'Timeout after 10s → identify which tool is blocking',
    'Memory grows unbounded → find memory leak',
  ],
  prerequisites: ['System architecture knowledge'],
  steps: [
    {
      step: 1,
      action: 'Observe symptoms',
      description: 'Is it consistent or intermittent? Specific task or all? Error or silent hang?',
    },
    {
      step: 2,
      action: 'Narrow the scope',
      description: 'Is it system vs. agent? Task-specific? Tool-specific?',
    },
    {
      step: 3,
      action: 'Check dependencies',
      description: 'Verify database, APIs, and network connectivity',
    },
    {
      step: 4,
      action: 'Review recent changes',
      description: 'Check for code, data volume, tool, or config changes',
    },
    {
      step: 5,
      action: 'Reproduce & isolate',
      description: 'Create minimal test case and add logging to pinpoint cause',
    },
  ],
  content: `# Diagnose Agent Failures

When agents fail, use a systematic approach to find the root cause.

## The Diagnostic Process

1. **Observe the symptoms**
   - Does it always fail or intermittently?
   - Specific task or all tasks?
   - Error message or silent hang?

2. **Narrow the scope**
   - Is it specific to this agent? (system vs. agent issue)
   - Is it specific to this task? (data-dependent?)
   - Is it specific to this tool? (tool vs. agent)

3. **Check dependencies**
   - Database: running? responsive? locked?
   - APIs: responding? timing out? rate limited?
   - Network: connectivity? DNS resolution?

4. **Review recent changes**
   - Code changes?
   - Data volume increase?
   - Tool changes?
   - Config changes?

5. **Reproduce and isolate**
   - Can you reproduce consistently?
   - What's the minimal case?
   - Add logging to pinpoint

## Checklist

- [ ] Exact error message?
- [ ] When did it start?
- [ ] Is it reproducible?
- [ ] What changed recently?
- [ ] Resource usage (CPU/mem/disk)?
- [ ] Dependencies healthy?
- [ ] Logs contain clues?`,
};
