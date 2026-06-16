import type { BuiltinSkill } from './mod.ts';

export const memorySystemsSkill: BuiltinSkill = {
  name: 'memory-systems',
  description:
    'Working with Cortex episodic (session history), semantic (knowledge), procedural (skills), and reflection memory. Use when storing information, retrieving context, building long-term learning, or managing agent knowledge.',
  tags: ['memory', 'knowledge', 'learning', 'storage'],
  difficulty: 'intermediate',
  examples: [
    'Storing task outcomes in episodic memory',
    'Building semantic knowledge from experiences',
    'Extracting reusable skills from sessions',
    'Using memory to inform decisions',
    'Organizing knowledge hierarchically',
  ],
  prerequisites: ['Understanding of memory systems'],
  content: `# Memory Systems in Cortex

Cortex agents have multiple memory layers that work together to learn, reason, and improve over time. Understand how to use each layer effectively.

## Memory Architecture

Cortex uses four types of memory:

### 1. Episodic Memory (Session History)

**What**: Events, conversations, actions, and outcomes from agent sessions

**Stored as**: Session transcripts, interaction records, tool calls, results

**Characteristics**:
- Time-ordered sequence of events
- Rich context (what happened, why, what was the result)
- Includes failures and successes equally
- Decays over time or is pruned by age

**When to use**:
- "What happened in our last session?"
- "How did we solve this before?"
- "What was the exact error message?"
- Retrieving conversation history

**Example**:
\`\`\`
Episodic: In session abc123, user asked to "build a login form"
- Agent planned: Create form component → add validation → style
- Agent used tools: Fetch user form template, search CSS libraries
- Outcome: Form built, tested with sample data
- Time: 2026-06-15 14:23:45 UTC
\`\`\`

### 2. Semantic Memory (Knowledge Base)

**What**: Facts, concepts, relationships, and domain knowledge

**Stored as**: Extracted knowledge, entity relationships, learned concepts

**Characteristics**:
- Decontextualized from original events
- Organized hierarchically (concept → sub-concepts)
- Persistent and long-lived
- References episodic sources

**When to use**:
- "What is a microservice?"
- "How does authentication work?"
- "What are best practices for X?"
- General reasoning and background

**Example**:
\`\`\`
Semantic: 
- Concept: "Form validation"
  - Sub-concept: "Email validation" (regex: /.+@.+/)
  - Sub-concept: "Required field" (check length > 0)
  - Learned from: Sessions abc123, def456
\`\`\`

### 3. Procedural Memory (Skills)

**What**: Reusable patterns, workflows, and procedures

**Stored as**: Skills with steps, trigger patterns, success rates

**Characteristics**:
- Actionable and specific
- Has measurable success rate
- Learned from repeated successful execution
- Gets refined with use

**When to use**:
- "How do we typically build login forms?"
- "What's our process for database migrations?"
- "What steps are in the deployment procedure?"
- Automating known-good patterns

**Example**:
\`\`\`
Procedural: Skill "build-form-with-validation"
- Trigger: User asks to build a form with validation
- Steps:
  1. Create component file
  2. Add input fields with types
  3. Add client-side validation
  4. Add server-side validation
  5. Test with invalid data
- Success rate: 92% (from 13 uses)
\`\`\`

### 4. Reflection Memory (Learned Patterns)

**What**: Insights, patterns, and principles extracted from experience

**Stored as**: Reflection entries with categories

**Characteristics**:
- Meta-level observations
- References to supporting evidence
- Evolves as new data accumulates
- Guides future decisions

**When to use**:
- "What have we learned about X?"
- "What patterns do we see?"
- "What principles should guide us?"
- Making high-level decisions

**Example**:
\`\`\`
Reflection:
- Pattern: "API errors are often due to wrong input validation"
  - Evidence: 7 recent sessions with this issue
  - Implication: Always validate inputs before API calls
  - Action: Add validation step to our form skill
\`\`\`

## Using Memory Effectively

### 1. Store the Right Things

**Good to store episodically**:
- Specific conversations and decisions
- Tool call results and errors
- Step-by-step execution traces
- Timing and performance metrics

**Good to extract into semantic memory**:
- Reusable facts and concepts
- Domain knowledge (how X works)
- Definitions and relationships
- Lessons learned

**Good to extract into procedural memory**:
- Workflows that succeeded repeatedly
- Step-by-step procedures
- Patterns that work

**Good to extract into reflection memory**:
- High-level insights
- Surprising discoveries
- Principles and guidelines
- Warnings and antipatterns

### 2. Retrieve the Right Memory

When planning a task, retrieve:

1. **Episodic**: Have we done this before? (specific precedents)
2. **Semantic**: What do we know about this? (background knowledge)
3. **Procedural**: Do we have a pattern? (known-good process)
4. **Reflection**: What have we learned? (principles and patterns)

### 3. Manage Memory Growth

Memory grows with use. Manage it:

- **Episodic**: Keep recent sessions, archive old ones
- **Semantic**: Consolidate redundant knowledge, refine hierarchies
- **Procedural**: Keep high-confidence skills, deprecate low-value ones
- **Reflection**: Periodically review and update principles

## Memory Decay & Refresh

Memories don't last forever:

- **Episodic**: Decays quickly (days to weeks)
- **Semantic**: Decays slowly (months to years) but can be reinforced
- **Procedural**: Decays when not used, but stays if successful
- **Reflection**: Stable unless contradicted by new evidence

**Refresh pattern**:
- Using a skill makes it stronger (higher success rate, more recent)
- Repeated use in similar contexts makes semantic knowledge stick
- New contradictory evidence should trigger reflection updates
- Rare edge cases should be documented in episodic memory

## Memory-Driven Decision Making

Use memory to make better decisions:

\`\`\`
Task: User asks to build an API endpoint

1. Check episodic: "Have we built APIs recently?"
   → Yes, 3 times in the last week
   → What patterns worked?

2. Check semantic: "What do we know about API design?"
   → REST vs GraphQL tradeoffs
   → Authentication patterns
   → Error handling patterns

3. Check procedural: "Do we have a skill for this?"
   → Yes: "build-api-endpoint" skill
   → Success rate: 94%
   → Use this as the starting point

4. Check reflection: "What have we learned?"
   → "Input validation is critical"
   → "Error responses should be consistent"
   → Apply these principles

Result: Informed, high-quality decision grounded in experience
\`\`\`

## Memory Anti-Patterns

**Problem**: Hoarding everything
- **Issue**: Memory becomes noisy, retrieval is slow, signal-to-noise ratio drops
- **Solution**: Actively prune and consolidate

**Problem**: Forgetting what worked
- **Issue**: Reinventing the wheel, repeating mistakes
- **Solution**: Extract patterns into procedural and reflection memory

**Problem**: Treating all memories equally
- **Issue**: Old contradicted knowledge influences new decisions
- **Solution**: Weight by recency and success rate

**Problem**: Not learning from failures
- **Issue**: Same mistakes happen repeatedly
- **Solution**: Extract failures into reflection memory with specifics

## Memory System Checklist

When working with Cortex memory:

- [ ] Did I capture the outcome (episodic)?
- [ ] Did I identify reusable facts (semantic)?
- [ ] Did I extract a repeatable process (procedural)?
- [ ] Did I reflect on what was learned (reflection)?
- [ ] Are older memories still relevant or should they decay?
- [ ] Does memory support my next decision?
- [ ] Am I reinforcing good patterns?
- [ ] Am I learning from failures?

## Key Insight

**Memory is what separates a single-session tool from a learning agent.** By strategically storing and retrieving different types of memories, agents can become smarter, faster, and more reliable over time.`,
};
