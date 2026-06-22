import type { Tool, ToolCallResult, ToolContext } from '../types.ts';
import {
  formatSkillDetail,
  getSkillByName,
  type SkillLifecycle,
  type SkillStep,
} from '../../memory/skills.ts';

export const loadSkillTool: Tool = {
  definition: {
    name: 'load_skill',
    description:
      'Load the full instructions for a specific skill. Use this before executing a skill listed in Available Skills. Call with the skill name to get detailed steps, lifecycle, trust tier, and quality scores.',
    capabilities: ['db:read'],
    params: [
      {
        name: 'name',
        type: 'string',
        description: 'The skill name to load (from the Available Skills list)',
        required: true,
      },
    ],
  },

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolCallResult> {
    const name = String(args.name ?? '').trim();

    if (!name) {
      return {
        toolName: 'load_skill',
        success: false,
        output: '',
        error: 'Skill name is required',
        durationMs: 0,
      };
    }

    try {
      const { touchSkill } = await import('../../memory/skills.ts');
      const skill = await getSkillByName(name);
      if (!skill) {
        return {
          toolName: 'load_skill',
          success: false,
          output: '',
          error: `Skill not found: ${name}`,
          errorInfo: {
            code: 'SKILL_NOT_FOUND',
            message: `No skill named "${name}" exists`,
            retryable: false,
            suggestedAction: 'Check the Available Skills list for the correct name.',
          },
          durationMs: 0,
        };
      }

      touchSkill(name).catch(() => {});

      return {
        toolName: 'load_skill',
        success: true,
        output: formatSkillDetail(skill),
        durationMs: 0,
      };
    } catch (err) {
      return {
        toolName: 'load_skill',
        success: false,
        output: '',
        error: `Failed to load skill: ${(err as Error).message}`,
        errorInfo: {
          code: 'SKILL_LOAD_ERROR',
          message: (err as Error).message,
          retryable: true,
        },
        durationMs: 0,
      };
    }
  },
};
