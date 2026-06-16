import type { BuiltinSkill } from './mod.ts';

export const extractSemanticKnowledgeSkill: BuiltinSkill = {
  name: 'extract-semantic-knowledge',
  description:
    'Extract general knowledge and concepts from experiences. Use to generalize from specific examples to broader understanding.',
  tags: ['memory', 'learning', 'knowledge', 'concepts'],
  difficulty: 'intermediate',
  examples: [
    'From 3 database migrations: "Migrations need testing on production-scale data"',
    'From multiple API errors: "Validation must happen before API calls"',
    'From code reviews: "Early code reviews catch 60% of issues"',
  ],
  prerequisites: ['Multiple related experiences'],
  steps: [
    {
      step: 1,
      action: 'Identify the knowledge domain',
      description: 'What domain and concept? (database, API, testing, validation, etc.)',
    },
    {
      step: 2,
      action: 'Collect evidence from past events',
      description: 'Find 3+ related experiences and identify the common pattern',
    },
    {
      step: 3,
      action: 'Formulate a principle',
      description: 'Create a general statement like "Always X before Y" or "When Z, do W"',
    },
    {
      step: 4,
      action: 'Link to source events',
      description: 'Document which sessions taught this principle',
    },
    {
      step: 5,
      action: 'Apply to future decisions',
      description: 'Update processes and use principle in decision-making',
    },
  ],
  content: `# Extract Semantic Knowledge

Convert specific experiences into general principles and knowledge.

## The Pattern

1. **Identify the category**
   - What domain? (database, API, testing, etc.)
   - What concept? (validation, performance, reliability, etc.)

2. **Collect evidence**
   - Find 3+ related past events
   - What pattern do they show?
   - Any exceptions?

3. **Formulate principle**
   - "Always X before Y"
   - "When Z happens, do W"
   - "Best practice: A and B"

4. **Link to source**
   - What sessions taught us this?
   - Can we cite examples?

5. **Apply going forward**
   - Update processes
   - Share with other agents
   - Use in decision-making

## Example

From experience:
- Session 1: API validation missed edge case → error in production
- Session 2: Client-side validation wasn't enough → server-side fix needed
- Session 3: Validation on both sides prevented 5 issues

Extracted knowledge:
**Principle**: "Always validate on both client and server"
**Sources**: Sessions 1, 2, 3
**Implication**: Add validation to checklist`,
};
