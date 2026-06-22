import type { BuiltinSkill } from './mod.ts';

export const learnProceduralSkillsSkill: BuiltinSkill = {
  name: 'learn-procedural-skills',
  description:
    'Capture reusable step-by-step procedures from successful executions. Use after completing a repeatable task.',
  tags: ['memory', 'learning', 'skills', 'procedures'],
  difficulty: 'intermediate',
  examples: [
    'After 3 successful migrations: Create "add-database-migration" skill',
    'After 2 successful deployments: Create "deploy-to-production" skill',
    'After multiple API integrations: Create "integrate-rest-api" skill',
  ],
  prerequisites: ['Multiple successful task completions'],
  steps: [
    {
      step: 1,
      action: 'Identify the repeating pattern',
      description: 'Verify task was completed successfully 2+ times with clear, consistent steps',
    },
    {
      step: 2,
      action: 'Extract numbered steps',
      description: 'Create 5-7 actionable steps with decision points and clear outcomes',
    },
    {
      step: 3,
      action: 'Document trigger conditions',
      description: 'Specify when skill should be used and what must exist first',
    },
    {
      step: 4,
      action: 'Validate reliability',
      description: 'Confirm success rate > 80% and document failure cases',
    },
    {
      step: 5,
      action: 'Register the skill',
      description: 'Add to skills system with tags and make available for reuse',
    },
  ],
  content: `# Learn Procedural Skills

Turn successful workflows into reusable skills that agents can apply to new tasks.

## When to Capture a Skill

- ✓ Same task completed successfully 2+ times
- ✓ Clear, repeatable steps
- ✓ High success rate
- ✓ Saves significant time
- ✗ One-off task or highly unique

## The Capture Process

1. **Identify the pattern**
   - What steps did we follow?
   - Could another agent do this?
   - Is it consistently successful?

2. **Extract the steps**
   - Number them 1-5
   - Make them actionable ("run X" not "be careful about X")
   - Include decision points

3. **Document trigger**
   - When should this skill be used?
   - What patterns trigger it?
   - What should exist first?

4. **Note success rate**
   - How many times successful?
   - What went wrong when it failed?
   - Is it > 80% reliable?

5. **Register the skill**
   - Add to skills system
   - Tag with context
   - Make available for reuse

## Example Skill

Name: "add-database-migration"
Trigger: "User asks to change database schema"
Success rate: 94% (16/17)

Steps:
1. Create migration file with timestamp
2. Write SQL with IF NOT EXISTS
3. Test on local DB
4. Test on staging DB
5. Deploy to production`,
};
