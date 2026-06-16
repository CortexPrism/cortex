import type { BuiltinSkill } from './mod.ts';

export const handleFailureRecoverySkill: BuiltinSkill = {
  name: 'handle-failure-recovery',
  description: 'Recover from errors and adapt plans when things fail. Use when a tool fails, API returns error, or step doesn\'t work.',
  tags: ['reasoning', 'failure', 'recovery', 'resilience'],
  difficulty: 'intermediate',
  examples: [
    'Database migration fails - roll back and investigate',
    'API timeout - retry with backoff',
    'Type error in code - fix and re-run tests',
    'Permission denied - use different approach'
  ],
  prerequisites: ['Error handling basics'],
  content: `# Handle Failure & Recovery

Failures are data. Don't panic—use them to learn and adapt.

## The Recovery Pattern

1. **Understand the failure**
   - What failed? (tool, API, validation?)
   - What was the error?
   - Is it reversible?

2. **Assess impact**
   - Is the whole task blocked?
   - Can we work around it?
   - Do we need to rollback?

3. **Adapt the plan**
   - Try different approach
   - Use fallback method
   - Break into smaller steps

4. **Execute & validate**
   - Implement the workaround
   - Verify it works
   - Check for side effects

5. **Document & learn**
   - What prevented this?
   - How do we avoid next time?
   - Update for future runs

## Common Failures

| Failure | Response |
|---------|----------|
| API timeout | Retry with exponential backoff |
| Permission denied | Use different user/role or alternative tool |
| Type error | Fix code, re-run tests |
| Out of memory | Reduce batch size, process incrementally |
| Database locked | Wait and retry or adjust transaction |`,
};
