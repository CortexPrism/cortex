import type { Tool, ToolCallResult, ToolContext } from '../types.ts';
import {
  type SkillStep,
  deleteSkill,
  getSkillByName,
  storeSkill,
} from '../../memory/skills.ts';

export const skillWriteTool: Tool = {
  definition: {
    name: 'skill_write',
    description:
      'Create, update, or delete a skill. Skills are reusable patterns that guide agent behavior. Use this to design and manage the skill library programmatically.',
    capabilities: ['db:write', 'db:read'],
    params: [
      {
        name: 'operation',
        type: 'string',
        description: 'Operation: "create", "update", or "delete"',
        required: true,
        enum: ['create', 'update', 'delete'],
      },
      {
        name: 'name',
        type: 'string',
        description: 'Skill name (snake_case, unique identifier)',
        required: true,
      },
      {
        name: 'description',
        type: 'string',
        description: 'Short description of what the skill does and when to use it',
        required: false,
      },
      {
        name: 'content',
        type: 'string',
        description: 'Full markdown instructions for the skill. For create/update only.',
        required: false,
      },
      {
        name: 'trigger_pattern',
        type: 'string',
        description: 'Phrase or pattern that triggers this skill automatically',
        required: false,
      },
      {
        name: 'steps',
        type: 'array',
        description:
          'Ordered steps for the skill. Each step: { step: number, action: string, tool?: string, params?: object }',
        required: false,
      },
    ],
  },

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolCallResult> {
    const op = String(args.operation ?? '').trim();
    const name = String(args.name ?? '').trim();

    if (!name) {
      return {
        toolName: 'skill_write',
        success: false,
        output: '',
        error: 'Skill name is required',
        errorInfo: {
          code: 'MISSING_NAME',
          message: 'A skill name (snake_case) is required.',
          retryable: false,
        },
        durationMs: 0,
      };
    }

    if (op === 'delete') {
      const deleted = await deleteSkill(name);
      return {
        toolName: 'skill_write',
        success: deleted,
        output: deleted ? `Skill "${name}" deleted.` : '',
        error: deleted ? undefined : `Skill "${name}" not found.`,
        errorInfo: deleted ? undefined : {
          code: 'SKILL_NOT_FOUND',
          message: `No skill named "${name}" exists.`,
          retryable: false,
        },
        durationMs: 0,
      };
    }

    if (op === 'create' || op === 'update') {
      const description = args.description ? String(args.description).trim() : undefined;
      const content = args.content ? String(args.content).trim() : undefined;
      const triggerPattern = args.trigger_pattern ? String(args.trigger_pattern).trim() : undefined;

      let steps: SkillStep[] | undefined;
      if (Array.isArray(args.steps) && args.steps.length > 0) {
        steps = args.steps.map((s: unknown, i: number) => {
          const step = s as Record<string, unknown>;
          return {
            step: i + 1,
            action: String(step.action ?? ''),
            description: String(step.action ?? ''),
            tool: step.tool as string | undefined,
            params: step.params as Record<string, unknown> | undefined,
          };
        });
      }

      if (op === 'update') {
        const existing = await getSkillByName(name);
        if (!existing) {
          return {
            toolName: 'skill_write',
            success: false,
            output: '',
            error: `Skill "${name}" not found. Use operation "create" to create a new skill.`,
            errorInfo: {
              code: 'SKILL_NOT_FOUND',
              message: `No skill named "${name}" exists to update.`,
              retryable: false,
              suggestedAction: 'Use operation "create" instead.',
            },
            durationMs: 0,
          };
        }
      }

      const finalSteps: SkillStep[] = steps ?? [{
        step: 1,
        action: content ?? description ?? '',
        description: content ?? description ?? '',
      }];

      const id = await storeSkill({
        name,
        description,
        triggerPattern,
        steps: finalSteps,
        origin: 'human',
        content,
      });

      return {
        toolName: 'skill_write',
        success: true,
        output: `Skill "${name}" ${op === 'create' ? 'created' : 'updated'} (id: ${id}).`,
        durationMs: 0,
      };
    }

    return {
      toolName: 'skill_write',
      success: false,
      output: '',
      error: `Unknown operation: "${op}". Use "create", "update", or "delete".`,
      errorInfo: {
        code: 'INVALID_OP',
        message: `Operation must be create, update, or delete. Got: ${op}`,
        retryable: false,
      },
      durationMs: 0,
    };
  },
};
