import type { BuiltinSkill } from './mod.ts';

export const analyzeErrorsSkill: BuiltinSkill = {
  name: 'analyze-errors',
  description: 'Understand error messages and trace them to root causes. Use when code, API, or tool returns error.',
  tags: ['debugging', 'errors', 'diagnostics', 'troubleshooting'],
  difficulty: 'intermediate',
  examples: [
    '"TypeError: Cannot read property of null" → missing validation',
    '"SQLITE_CONSTRAINT" → unique key violation',
    '"Connection refused" → service not running'
  ],
  prerequisites: ['Error message interpretation basics'],
  content: `# Analyze Errors

Extract maximum information from error messages.

## Error Analysis Pattern

1. **Extract the error**
   - Error type (TypeError, ENOENT, SQLError, etc.)
   - Error message (specific text)
   - Stack trace (where did it fail?)

2. **Understand the category**
   - Input error? (bad data passed in)
   - System error? (resource/permission issue)
   - Logic error? (code bug)
   - External error? (API/service failure)

3. **Trace the cause**
   - What triggered it?
   - What line of code?
   - What precondition was violated?

4. **Find the fix**
   - Input validation?
   - Code fix?
   - Configuration change?
   - Fallback strategy?

5. **Prevent recurrence**
   - Add test for this case?
   - Better error message?
   - Documentation?

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| null reference | Missing validation | Check before use |
| Permission denied | Wrong user/role | Use correct credentials |
| Timeout | Too slow | Add async, optimize, increase limit |
| Out of memory | Memory leak or huge data | Profile memory, reduce batch |
| Type mismatch | Wrong data format | Add type checking |`,
};
