import type { BuiltinSkill } from './mod.ts';

export const profilePerformanceSkill: BuiltinSkill = {
  name: 'profile-performance',
  description: 'Find performance bottlenecks and optimize slow operations. Use when agent or tool is slower than expected.',
  tags: ['debugging', 'performance', 'optimization', 'profiling'],
  difficulty: 'advanced',
  examples: [
    'Query takes 5 seconds → add database index',
    'Agent takes 2 minutes → which tool is slow?',
    'Memory usage grows → find memory leak'
  ],
  prerequisites: ['Performance analysis basics'],
  content: `# Profile Performance

Systematic approach to finding and fixing performance issues.

## The Profiling Process

1. **Measure baseline**
   - How long should it take?
   - How long does it actually take?
   - Gap = problem size

2. **Identify bottleneck**
   - Is it CPU, memory, I/O, or network?
   - Which component? (agent, tool, database, API)
   - How much time in each?

3. **Analyze the slow part**
   - Why is it slow?
   - Is it algorithmic complexity?
   - Are resources limited?
   - Missing optimization?

4. **Test optimization**
   - Implement fix (small change first)
   - Measure improvement
   - Any side effects?
   - Worth the complexity?

5. **Deploy and verify**
   - Check in production
   - Monitor metrics
   - Compare before/after

## Common Optimization

| Issue | Solution |
|-------|----------|
| Slow database | Add index, optimize query |
| Slow API | Cache, batch requests, async |
| High memory | Stream instead of load, reduce batch |
| CPU bottleneck | Parallel processing, reduce calculations |
| Network slow | Compress, reduce payloads, CDN |`,
};
