import type { BuiltinSkill } from './mod.ts';

export const planComplexTasksSkill: BuiltinSkill = {
  name: 'plan-complex-tasks',
  description: 'Break down complex requests into concrete sub-goals and tasks. Use when a user asks to do something multi-faceted.',
  tags: ['reasoning', 'planning', 'decomposition'],
  difficulty: 'intermediate',
  examples: [
    'User: "Build a dashboard with auth, database, and API"',
    'User: "Refactor the codebase and optimize performance"',
    'User: "Set up CI/CD and deploy to production"'
  ],
  prerequisites: ['Understanding of project scope'],
  content: `# Plan Complex Tasks

When facing a complex request, decompose it into smaller, independent sub-goals.

## The Pattern

1. **Identify the goal** - What does the user want to achieve?
2. **List sub-goals** - Break into 5-7 concrete parts (each independently testable)
3. **Order by dependency** - What must happen first? What can be parallel?
4. **Estimate scope** - Is each sub-goal reasonable to complete?
5. **Communicate the plan** - Show the user your breakdown before executing

## Example

User: "Build a login system"

Sub-goals:
1. Design database schema for users
2. Implement password hashing
3. Create login endpoint
4. Add session management
5. Build login UI
6. Add error handling
7. Test end-to-end

Order: 1 → 2,3 → 4 → 5 → 6,7

## When to Use

- Request involves 3+ different systems (frontend, backend, database)
- User is unclear on scope
- Task could take 1+ hours
- Multiple dependencies between tasks`,
};
