import type { BuiltinSkill } from './mod.ts';

export const designToolInterfaceSkill: BuiltinSkill = {
  name: 'design-tool-interface',
  description: 'Design tool parameters and responses so agents can use them reliably. Use when building new tools or APIs.',
  tags: ['development', 'api', 'tools', 'design'],
  difficulty: 'intermediate',
  examples: [
    'Tool returns raw JSON → structure with success flag and error field',
    'Parameters too flexible → require specific fields',
    'No error info → add error codes and messages'
  ],
  prerequisites: ['API design basics'],
  content: `# Design Tool Interface

Tools are how agents interact with systems. Good design = reliable execution.

## Input Design

**Clear parameters:**
- Required vs. optional (required first)
- Type information (string, number, enum)
- Validation rules (format, range, constraints)
- Example values

**Bad:** \`{ data: "stuff" }\`
**Good:** \`{ userId: "uuid", includeProfile: bool }\`

## Output Design

**Consistent structure:**
\`\`\`
{
  success: boolean,
  data: {...},
  error?: string
}
\`\`\`

**Error details:**
- Error code (helps agent decide retry/fallback)
- Human-readable message
- Suggestions for recovery

## Checklist

- [ ] All parameters documented?
- [ ] Validation happens first?
- [ ] Errors are actionable?
- [ ] Response structure consistent?
- [ ] Timeouts implemented?
- [ ] Rate limiting clear?
- [ ] Idempotent when needed?`,
};
