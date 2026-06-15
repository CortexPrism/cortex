import type { Tool, ToolCallResult, ToolContext } from '../types.ts';
import { formatSkillDetail, getSkillByName, listSkills } from '../../memory/skills.ts';

export const skillReadTool: Tool = {
  definition: {
    name: 'skill_read',
    description:
      'Read skill details, list available skills, or browse the skill library. Use this to inspect existing skills before modifying them.',
    capabilities: ['db:read'],
    params: [
      {
        name: 'name',
        type: 'string',
        description: 'Name of a specific skill to read. Omit to list all human-authored skills.',
        required: false,
      },
      {
        name: 'origin',
        type: 'string',
        description: 'Filter by origin: "human" or "llm". Only used when listing (no name provided).',
        required: false,
        enum: ['human', 'llm'],
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Max number of skills to list (default 20). Only used when listing.',
        required: false,
      },
    ],
  },

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolCallResult> {
    const name = args.name ? String(args.name).trim() : undefined;

    try {
      if (name) {
        const skill = await getSkillByName(name);
        if (!skill) {
          return {
            toolName: 'skill_read',
            success: false,
            output: '',
            error: `Skill not found: ${name}`,
            errorInfo: {
              code: 'SKILL_NOT_FOUND',
              message: `No skill named "${name}" exists.`,
              retryable: false,
              suggestedAction: 'Use skill_read without a name to list available skills.',
            },
            durationMs: 0,
          };
        }

        return {
          toolName: 'skill_read',
          success: true,
          output: formatSkillDetail(skill),
          durationMs: 0,
        };
      }

      // List mode
      const origin = args.origin as 'human' | 'llm' | undefined;
      const limit = typeof args.limit === 'number' ? Math.max(1, Math.min(args.limit, 50)) : 20;
      const skills = await listSkills(limit, origin);

      if (skills.length === 0) {
        return {
          toolName: 'skill_read',
          success: true,
          output: 'No skills found.',
          durationMs: 0,
        };
      }

      const listing = skills.map((s) => {
        const rate = Math.round(s.success_rate * 100);
        const originLabel = s.origin === 'human' ? 'human-authored' : 'learned';
        return `- **${s.name}** (${originLabel}, ${rate}% success): ${s.description ?? '(no description)'} [trigger: ${s.trigger_pattern ?? 'any'}]`;
      }).join('\n');

      return {
        toolName: 'skill_read',
        success: true,
        output: `## Skills (${skills.length})\n\n${listing}\n\nUse \`skill_read\` with \`name\` to inspect a specific skill, or \`load_skill\` to load full instructions.`,
        durationMs: 0,
      };
    } catch (err) {
      return {
        toolName: 'skill_read',
        success: false,
        output: '',
        error: `Failed to read skills: ${(err as Error).message}`,
        errorInfo: {
          code: 'SKILL_READ_ERROR',
          message: (err as Error).message,
          retryable: true,
        },
        durationMs: 0,
      };
    }
  },
};
