import type { BuiltinSkill } from './mod.ts';

export const systemDebuggingSkill: BuiltinSkill = {
  name: 'system-debugging',
  description:
    'Debugging agents, analyzing logs, diagnosing errors, and troubleshooting system issues in Cortex. Use when investigating failures, performance problems, or unexpected behavior.',
  tags: ['debugging', 'troubleshooting', 'diagnostics', 'errors'],
  difficulty: 'advanced',
  examples: [
    'Analyzing agent loop failures and timeouts',
    'Diagnosing tool execution errors',
    'Tracing memory issues',
    'Investigating performance bottlenecks',
    'Debugging policy violations and security issues'
  ],
  prerequisites: ['System architecture knowledge', 'Error analysis experience'],
  content: `# System Debugging & Diagnostics

When things go wrong, effective debugging separates fast recovery from hours of frustration. Master these patterns.

## Debugging Methodology

### 1. The Scientific Method

When investigating a problem:

\`\`\`
1. OBSERVE: What's the symptom? (error, slowness, wrong result?)
2. HYPOTHESIZE: What could cause it? (3-5 hypotheses)
3. TEST: Can I reproduce it? What makes it happen/not happen?
4. ANALYZE: Which hypothesis fits the evidence?
5. FIX: Address the root cause
6. VERIFY: Does the fix work? Are there side effects?
\`\`\`

**Key**: Don't just fix the symptom. Find and fix the root cause.

### 2. The Elimination Process

Start broad, get specific:

\`\`\`
Problem: "Agent is slow"

Narrow down:
1. Is it ALL agents or specific ones? (system vs. agent issue)
2. Is it ALL tasks or specific ones? (task-dependent?)
3. Is it CPU, memory, I/O, or network? (resource bottleneck?)
4. When did it start? (recent change? data growth?)
5. Is it consistent or intermittent? (timing-dependent?)
\`\`\`

Each answer eliminates possibilities and points to root cause.

## Common Issues & Diagnostics

### Agent Loop Hangs or Times Out

**Symptoms**:
- Agent stops responding
- Task takes much longer than expected
- No error message, just silence

**Diagnose**:

\`\`\`
1. Check logs: Where did it get stuck?
   - In tool execution? (tool is slow/hanging)
   - In planning? (infinite loop in reasoning)
   - In memory retrieval? (database slow)
   - In LLM call? (API timeout)

2. Check resource usage:
   - CPU: Is agent thread burning CPU? (infinite loop)
   - Memory: Is memory increasing? (memory leak)
   - I/O: Is disk/network active? (I/O bottleneck)

3. Check dependencies:
   - Database responding? (test with query)
   - API responding? (test endpoint)
   - Network connectivity? (ping, DNS)

4. Check recent changes:
   - Code changes?
   - Data changes?
   - Environment changes?
   - Load changes?
\`\`\`

**Solutions**:
- Infinite loop? → Add iteration limit, timeout
- Slow tool? → Optimize tool or run in parallel
- Slow database? → Add indexes, optimize query
- Slow API? → Cache, retry with backoff, async

### Tool Execution Failures

**Symptoms**:
- Tool returns error
- Tool returns wrong result
- Tool times out

**Diagnose**:

\`\`\`
1. Exact error:
   - What's the error message?
   - Stack trace? (where exactly?)
   - Error code? (database, API, OS?)

2. Tool inputs:
   - Are inputs valid? (type, format, range)
   - Did agent prepare inputs correctly?
   - Are dependencies available?

3. Tool environment:
   - Does tool have required permissions?
   - Are environment variables set?
   - Are dependencies installed?

4. Tool logic:
   - Does tool have bugs?
   - Are there edge cases not handled?
   - Does tool work in isolation?
\`\`\`

**Test approach**:
\`\`\`
# Test tool in isolation
const result = await myTool({ ... });

# Test with simplified inputs
const result = await myTool({ simple: 'input' });

# Test with previous working inputs
const result = await myTool(lastWorkingInputs);
\`\`\`

### Memory Issues

**Symptoms**:
- Memory usage grows over time
- Agent gets slower over time
- Old sessions affect new ones unexpectedly

**Diagnose**:

\`\`\`
1. What type of memory?
   - Episodic: Session history not being pruned?
   - Semantic: Knowledge accumulating without consolidation?
   - Procedural: Skills not being cleaned up?
   - Reflection: Patterns not being updated?

2. Data growth:
   - How much data per session?
   - How many sessions retained?
   - Is old data being deleted?
   - Are indexes being maintained?

3. Query performance:
   - How long to retrieve memory?
   - Is database indexed?
   - Are queries optimal?
\`\`\`

**Solutions**:
- Implement memory decay (delete old data)
- Archive historical data to separate storage
- Optimize queries with indexes
- Consolidate redundant knowledge
- Implement limits (max memories per type)

### Performance Bottlenecks

**Symptoms**:
- Specific operation is slow
- Degradation under load
- Inconsistent performance

**Profile to find**:

\`\`\`
1. Where is time spent?
   - Agent reasoning? (LLM calls)
   - Tool execution? (which tools?)
   - Memory access? (database queries)
   - Network? (API calls)

2. Tools individually:
   - Time tool A: 50ms ✓
   - Time tool B: 2000ms ✗ (slow!)
   - Time tool C: 100ms ✓

3. Database queries:
   - Which queries are slow?
   - Explain plan (are indexes used?)
   - How many queries run per operation?

4. Under load:
   - Single user: fast
   - 10 users: slow
   - Resource contention? (lock, CPU, memory)
\`\`\`

**Solutions**:
- Cache frequent queries
- Use async/parallel where possible
- Add database indexes
- Optimize LLM prompts (fewer tokens)
- Implement request batching

## Debugging Tools & Techniques

### 1. Logging

Add strategic logging to understand flow:

\`\`\`typescript
// Log entry and exit
logger.debug('Starting memory retrieval', { query, limit });
const result = await memory.retrieve(query, limit);
logger.debug('Memory retrieved', { count: result.length, duration: Date.now() - start });

// Log decisions
logger.info('Chose tool', { tool: name, reason: 'highest confidence', confidence });

// Log errors with context
logger.error('Tool failed', { tool: name, error: e.message, input, context });
\`\`\`

### 2. Assertions

Catch impossible states early:

\`\`\`typescript
// Validate assumptions
const skill = skills.find(s => s.name === name);
if (!skill) {
  logger.error('Skill not found', { requested: name, available: skills.map(s => s.name) });
  throw new Error(\`Skill \${name} not found\`);
}

// Check invariants
if (result.length > 0) {
  const sorted = result.map(r => r.score).sort((a, b) => a - b);
  if (sorted[sorted.length - 1] < 0.5) {
    logger.warn('Low confidence results', { scores: sorted, query });
  }
}
\`\`\`

### 3. Monitoring & Observability

Track metrics to spot issues early:

\`\`\`
- Agent duration (target: < 30s for most tasks)
- Tool success rate (target: > 95%)
- Memory retrieval time (target: < 100ms)
- API response time (target: < 1s)
- Error rate (target: < 1%)
- Agent completion rate (target: > 90%)
\`\`\`

### 4. Reproduction Techniques

Make issues reproducible:

\`\`\`
1. Exact inputs: Capture exactly what was provided
2. Exact environment: Deno version, OS, dependencies
3. Exact sequence: Reproduce step-by-step
4. Minimal case: Remove unrelated complexity
5. Add assertions: Check what should be true

Example:
\`\`\`typescript
// Minimal reproduction
const agent = new Agent({ model: 'claude-3-sonnet' });
const task = 'What is 2+2?';
const result = await agent.execute(task);
console.assert(result.success, 'Math should succeed');
console.assert(result.output === '4', 'Answer should be 4');
\`\`\`
\`\`\`

## Error Analysis Checklist

When analyzing an error:

- [ ] What is the exact error message?
- [ ] When did it first occur?
- [ ] Is it reproducible? (Always or sometimes?)
- [ ] What changed recently? (code, data, config)
- [ ] Is it system-wide or specific? (all tasks? all tools? all users?)
- [ ] What are the steps to reproduce?
- [ ] What's the simplest case that shows the error?
- [ ] What resources are affected? (CPU, memory, disk, network)
- [ ] Are there any related errors in logs?
- [ ] What's the impact? (blocking? performance? data integrity?)
- [ ] Can we work around it while investigating?
- [ ] What's the root cause?
- [ ] How do we prevent this in the future?

## Key Debugging Principles

**Principle 1**: Make one change at a time
- Change one thing, test, see if it helps
- Changing multiple things makes it hard to know what fixed it

**Principle 2**: Trust the data, not assumptions
- Check actual logs, don't guess
- Reproduce, don't trust bug reports alone
- Measure before and after

**Principle 3**: Isolate the problem
- Is it the code? Database? Infrastructure? Integration?
- Test each component independently
- Narrow down the scope systematically

**Principle 4**: Document as you debug
- What did you try?
- What worked? What didn't?
- What did you learn?
- This becomes the solution for next time

## Debugging Pitfalls

**Pitfall**: Assuming the obvious cause
- **Problem**: "It's definitely a database issue" → spends 2 hours optimizing
- **Solution**: Test hypotheses, don't assume

**Pitfall**: Changing things at random
- **Problem**: Changes 5 configs, things work, doesn't know what fixed it
- **Solution**: One change at a time, test each

**Pitfall**: Not capturing the error
- **Problem**: "Sometimes it fails" without being able to reproduce it
- **Solution**: Log extensively, add metrics, get reproduction steps

**Pitfall**: Fixing symptoms, not causes
- **Problem**: Adds timeout (symptom) but doesn't fix slow query (cause)
- **Solution**: Always ask "Why?" until you hit the root cause

## Key Insight

**Debugging is a skill like any other.** The faster you debug, the faster you can fix issues and get systems working. Master the methodology, build good tools, and you'll save enormous amounts of time.`,
};
