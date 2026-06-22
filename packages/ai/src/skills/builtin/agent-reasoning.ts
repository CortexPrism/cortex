import type { BuiltinSkill } from './mod.ts';

export const agentReasoningSkill: BuiltinSkill = {
  name: 'agent-reasoning',
  description:
    'Techniques for agent planning, reasoning, and problem decomposition. Use when breaking down complex tasks, planning multi-step workflows, handling uncertainty, and reflecting on outcomes.',
  tags: ['reasoning', 'planning', 'agent', 'strategy'],
  difficulty: 'intermediate',
  examples: [
    'Breaking a user request into sub-goals and tasks',
    'Planning when to use tools vs. reasoning',
    'Handling failures and replanning',
    'Evaluating confidence in decisions',
  ],
  prerequisites: ['Agent loop understanding'],
  content: `# Agent Reasoning & Planning Patterns

Agents succeed when they reason clearly, plan methodically, and adapt to failures. This skill covers core reasoning patterns used in Cortex agents.

## Problem Decomposition

Break complex requests into smaller, manageable sub-goals:

\`\`\`
User request: "Build a dashboard with auth, database, and API"

Decompose into:
1. Understand requirements (auth method, data schema, API design)
2. Create database schema and migrations
3. Implement authentication system
4. Build API endpoints
5. Create frontend dashboard
6. Test integration
7. Document and deploy
\`\`\`

**Key Pattern**: Each sub-goal should be independently testable and completable.

## Plan-Then-Act Pattern

Before executing a complex task:

1. **Plan**: Write out the approach and steps
2. **Validate**: Check if the plan makes sense
3. **Execute**: Carry out the plan
4. **Verify**: Test results against expectations
5. **Reflect**: What worked? What failed? What to improve?

Example:
\`\`\`
PLAN: To add a new CLI command:
- Create src/cli/<feature>.ts with Command class
- Import and register in src/main.ts
- Test with deno task check and manual run
- Update CHANGELOG.md and version

EXECUTE: [carry out steps]

VERIFY: Run \`deno task check\`, test command manually

REFLECT: Did it match expectations? Any edge cases missed?
\`\`\`

## Uncertainty Handling

When uncertain, use this pattern:

1. **Identify uncertainty**: What's unclear?
2. **Reduce uncertainty**: Ask clarifying questions, research, test assumptions
3. **Act with caution**: Design reversible changes first
4. **Monitor**: Watch for problems
5. **Adapt**: Adjust if reality doesn't match assumptions

Example:
\`\`\`
Uncertain about: Database performance for large datasets

Reduce:
- What size is "large"? (ask user / check requirements)
- What access patterns? (read-heavy, write-heavy, random)
- What latency requirements?

Act Cautiously:
- Start with basic schema, add indexes later
- Use query profiling to measure
- Design for schema evolution

Adapt:
- If slow, analyze query plans
- Add indexes where needed
- Consider caching or denormalization
\`\`\`

## Decision Frameworks

Use these frameworks to decide what to do:

### Tool vs. Reasoning

**Use tools when**:
- The action is deterministic (fetch, write, execute)
- Results are verifiable (check file, API response)
- Task is specific and bounded

**Use reasoning when**:
- Decision-making is needed
- Tradeoffs must be weighed
- Context matters (what did we learn? what's the pattern?)

Example:
\`\`\`
✓ Tool: Fetch user from database → parse response
✓ Reasoning: Decide which caching strategy fits the workload
✗ Tool alone: "Use Redis caching" (needs reasoning about tradeoffs)
✗ Reasoning alone: "Fetch user 100 times" (just use a tool)
\`\`\`

### Sequential vs. Parallel Tasks

**Sequential** (one after another):
- Task B depends on output of Task A
- Tasks must happen in specific order
- Example: Create table → insert data

**Parallel** (simultaneous):
- Tasks are independent
- No dependencies between them
- Example: Fetch user AND fetch posts simultaneously

## Reflection & Learning

After executing a plan:

1. **What was the result?** (success, partial, failure)
2. **Did it match expectations?** (what surprised us?)
3. **What was the root cause?** (if it failed, why?)
4. **What can we learn?** (pattern to remember)
5. **Next time, what would we do differently?**

Example reflection:
\`\`\`
Task: Deploy new feature
Result: Deployment failed due to database migration error
Surprise: Migration script had SQL syntax issue (didn't test locally)
Root cause: Skipped local testing step
Learning: Always test migrations locally before deploying
Next time: Add pre-deployment checklist with test steps
\`\`\`

## Handling Failure

When something goes wrong:

1. **Don't panic**: Failures are data, not disasters
2. **Understand**: What failed? Why?
3. **Recover**: Is the failure reversible? Can we rollback?
4. **Learn**: What prevented this from being caught earlier?
5. **Improve**: Add safeguards (tests, checks, validation)

Example:
\`\`\`
Failure: Accidentally deleted production data

Don't panic:
- Data is lost but database is still running
- Backups may exist (check)

Understand:
- What command was run?
- Why was permission so open?

Recover:
- Restore from backup (hopefully)

Learn:
- Data deletion should require confirmation
- Sensitive operations should have safeguards

Improve:
- Add soft-delete, audit logging
- Require multi-step confirmation
- Add role-based access control
\`\`\`

## Common Reasoning Pitfalls

**Pitfall**: Over-planning
- **Problem**: Spend so much time planning that you don't execute
- **Solution**: Plan just enough to be confident, then start executing

**Pitfall**: Not adapting the plan
- **Problem**: Follow a plan even when new information says it's wrong
- **Solution**: Check assumptions frequently, update plan if needed

**Pitfall**: Assuming success
- **Problem**: Not thinking about what could go wrong
- **Solution**: Always ask "What could break?" and handle those cases

**Pitfall**: Not capturing learning
- **Problem**: Make the same mistake again because you didn't record what you learned
- **Solution**: After major tasks, reflect and document patterns

## Reasoning Checklist

Before executing a complex task:

- [ ] Did I understand the requirement?
- [ ] Did I break it into sub-goals?
- [ ] Do I know which tools to use?
- [ ] Did I plan the sequence?
- [ ] What could go wrong?
- [ ] How will I know if it worked?
- [ ] What am I most uncertain about?
- [ ] Did I test the approach on small data first?

## Key Insight

**Good agents don't just act fast—they think clearly, plan well, handle uncertainty, and learn from every experience.** The difference between a capable agent and an unreliable one is often just better reasoning.`,
};
