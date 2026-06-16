import type { BuiltinSkill } from './mod.ts';

export const useEpisodicMemorySkill: BuiltinSkill = {
  name: 'use-episodic-memory',
  description: 'Store and retrieve session history, conversations, and past events. Use to find previous solutions or understand context.',
  tags: ['memory', 'learning', 'history', 'context'],
  difficulty: 'beginner',
  examples: [
    'Check: "Have we solved this before? What did we do?"',
    'Review: "What error did we hit last time?"',
    'Retrieve: "How did we structure this previously?"'
  ],
  prerequisites: ['Understanding of session history'],
  content: `# Use Episodic Memory

Episodic memory is the session history—events, conversations, actions, outcomes.

## When to Use

**Before starting work:**
- "Have we done this before?"
- "What did we learn last time?"
- "What errors did we encounter?"

**During execution:**
- "What was the exact error message?"
- "How did we structure this before?"
- "What tools worked best?"

**After completion:**
- "What should we remember?"
- "What patterns did we see?"

## What to Store

✓ Successful approaches
✓ Error messages and solutions
✓ Tool call results
✓ Code patterns that worked
✓ Performance metrics

✗ Verbose logs (too much noise)
✗ Unrelated conversations
✗ Superseded solutions

## How to Use

1. Query: Search for similar past events
2. Extract: Pull relevant details
3. Apply: Adapt the past approach to current task
4. Verify: Confirm it still works
5. Update: Note what's different this time`,
};
