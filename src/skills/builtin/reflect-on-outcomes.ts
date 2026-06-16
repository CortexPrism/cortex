import type { BuiltinSkill } from './mod.ts';

export const reflectOnOutcomesSkill: BuiltinSkill = {
  name: 'reflect-on-outcomes',
  description: 'After completing a task, reflect on what worked and what to improve. Use after finishing a significant piece of work.',
  tags: ['reasoning', 'reflection', 'learning', 'improvement'],
  difficulty: 'beginner',
  examples: [
    'After building a feature: "What surprised me? What took longer than expected?"',
    'After debugging: "What could have caught this earlier?"',
    'After deployment: "What went smoothly? What was painful?"'
  ],
  prerequisites: ['Task completion experience'],
  content: `# Reflect on Outcomes

After executing a plan, spend 2-3 minutes reflecting. This builds agent memory.

## The Reflection Questions

1. **What was the result?**
   - Success, partial success, or failure?
   - Did it meet expectations?

2. **What surprised you?**
   - Unexpected outcomes?
   - Assumptions that were wrong?
   - Discoveries?

3. **What took longer/shorter than expected?**
   - Planning too optimistic or pessimistic?
   - Hidden complexity?

4. **What could we do better next time?**
   - What would prevent this issue?
   - What should we automate?
   - What needs documentation?

5. **What was the key learning?**
   - One sentence about what we learned

## Example

Task: Database migration that went wrong

Reflection:
- Result: Failed due to missing rollback plan (partial failure)
- Surprise: Migration timeout—data was larger than expected
- Timing: Estimated 30min, took 2 hours (forgot to test migration time)
- Improve: Always test migrations on production-scale data first
- Learning: Test migrations in parallel before deploying`,
};
