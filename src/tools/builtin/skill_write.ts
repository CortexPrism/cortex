import type { Tool, ToolCallResult, ToolContext } from '../types.ts';
import {
  deleteSkill,
  deleteSkills,
  deprecateSkill,
  getSkillByName,
  getSkillDependencies,
  getSkillDependents,
  mergeSkill,
  promoteSkill,
  type SkillLifecycle,
  type SkillStep,
  storeSkill,
} from '../../memory/skills.ts';

export const skillWriteTool: Tool = {
  definition: {
    name: 'skill_write',
    description:
      'Create, update, delete, merge, promote, or deprecate a skill. Skills are reusable patterns that guide agent behavior. Supports lifecycle management and dependency tracking.',
    capabilities: ['db:write', 'db:read'],
    params: [
      {
        name: 'operation',
        type: 'string',
        description:
          'Operation: "create", "update", "delete", "bulk_delete", "merge", "promote", "deprecate", "dependents", "dependencies"',
        required: true,
        enum: [
          'create',
          'update',
          'delete',
          'bulk_delete',
          'merge',
          'promote',
          'deprecate',
          'dependents',
          'dependencies',
        ],
      },
      {
        name: 'name',
        type: 'string',
        description: 'Skill name (snake_case, unique identifier)',
        required: true,
      },
      {
        name: 'names',
        type: 'array',
        description: 'Array of skill names for bulk_delete operation',
        required: false,
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
      {
        name: 'lifecycle',
        type: 'string',
        description:
          'Lifecycle state: candidate, verified, released, degraded, deprecated, archived',
        required: false,
        enum: ['candidate', 'verified', 'released', 'degraded', 'deprecated', 'archived'],
      },
      {
        name: 'trust_tier',
        type: 'number',
        description: 'Trust tier 1-4. 1=untrusted/LLM-extracted, 4=fully vetted built-in',
        required: false,
      },
      {
        name: 'depends_on',
        type: 'array',
        description: 'List of skill names this skill depends on',
        required: false,
      },
      {
        name: 'conflicts_with',
        type: 'array',
        description: 'List of skill names this skill conflicts with',
        required: false,
      },
      {
        name: 'parent_skill_id',
        type: 'string',
        description: 'Parent skill name for hierarchical organization',
        required: false,
      },
      {
        name: 'reason',
        type: 'string',
        description: 'Reason for deprecation or lifecycle change',
        required: false,
      },
      {
        name: 'source_name',
        type: 'string',
        description: 'Source skill name for merge operation',
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
      try {
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
      } catch (err) {
        return {
          toolName: 'skill_write',
          success: false,
          output: '',
          error: `Cannot delete "${name}": ${(err as Error).message}`,
          errorInfo: {
            code: 'DELETE_BLOCKED',
            message: (err as Error).message,
            retryable: false,
          },
          durationMs: 0,
        };
      }
    }

    if (op === 'bulk_delete') {
      const names = Array.isArray(args.names) ? args.names.map(String).filter(Boolean) : [];
      if (names.length === 0) {
        return {
          toolName: 'skill_write',
          success: false,
          output: '',
          error: 'Provide a "names" array of skills to delete.',
          errorInfo: {
            code: 'MISSING_NAMES',
            message: 'bulk_delete requires a "names" array.',
            retryable: true,
          },
          durationMs: 0,
        };
      }
      const result = await deleteSkills(names);
      const summary = `Deleted ${result.deleted} skill(s)${result.errors.length > 0 ? ', ' + result.errors.length + ' error(s): ' + result.errors.map(e => e.name + ': ' + e.error).join('; ') : ''}.`;
      return {
        toolName: 'skill_write',
        success: result.errors.length === 0,
        output: summary,
        error: result.errors.length > 0 ? result.errors.map(e => `${e.name}: ${e.error}`).join('\n') : undefined,
        durationMs: 0,
      };
    }

    if (op === 'promote') {
      const promoted = await promoteSkill(name);
      return {
        toolName: 'skill_write',
        success: promoted,
        output: promoted
          ? `Skill "${name}" promoted.`
          : `Skill "${name}" not found or already at max lifecycle.`,
        error: promoted ? undefined : 'Promotion failed',
        durationMs: 0,
      };
    }

    if (op === 'deprecate') {
      const reason = args.reason ? String(args.reason).trim() : 'Deprecated by user';
      const deprecated = await deprecateSkill(name, reason);
      return {
        toolName: 'skill_write',
        success: deprecated,
        output: deprecated ? `Skill "${name}" deprecated: ${reason}` : `Skill "${name}" not found.`,
        durationMs: 0,
      };
    }

    if (op === 'dependents') {
      const { getSkillDependents } = await import('../../memory/skills.ts');
      const deps = await getSkillDependents(name);
      return {
        toolName: 'skill_write',
        success: true,
        output: deps.length === 0
          ? `No skills depend on "${name}".`
          : `Skills depending on "${name}" (${deps.length}):\n${
            deps.map((d) => `- ${d.name} (${d.lifecycle})`).join('\n')
          }`,
        durationMs: 0,
      };
    }

    if (op === 'dependencies') {
      const deps = await getSkillDependencies(name);
      return {
        toolName: 'skill_write',
        success: true,
        output: deps.length === 0
          ? `"${name}" has no dependencies.`
          : `"${name}" depends on (${deps.length}):\n${
            deps.map((d) => `- ${d.name} (${d.lifecycle})`).join('\n')
          }`,
        durationMs: 0,
      };
    }

    if (op === 'merge') {
      const sourceName = args.source_name ? String(args.source_name).trim() : '';
      if (!sourceName) {
        return {
          toolName: 'skill_write',
          success: false,
          output: '',
          error: 'source_name is required for merge operation',
          errorInfo: {
            code: 'MISSING_SOURCE',
            message: 'Provide source_name (the skill to merge from).',
            retryable: false,
          },
          durationMs: 0,
        };
      }
      try {
        const result = await mergeSkill(name, sourceName);
        return {
          toolName: 'skill_write',
          success: true,
          output: `Merged "${sourceName}" into "${name}" (v${result?.version ?? '?'}).`,
          durationMs: 0,
        };
      } catch (err) {
        return {
          toolName: 'skill_write',
          success: false,
          output: '',
          error: `Merge failed: ${(err as Error).message}`,
          durationMs: 0,
        };
      }
    }

    if (op === 'create' || op === 'update') {
      const description = args.description ? String(args.description).trim() : undefined;
      const content = args.content ? String(args.content).trim() : undefined;
      const triggerPattern = args.trigger_pattern ? String(args.trigger_pattern).trim() : undefined;
      const lifecycle = args.lifecycle as SkillLifecycle | undefined;
      const trustTier = typeof args.trust_tier === 'number'
        ? Math.max(1, Math.min(4, args.trust_tier))
        : undefined;
      const dependsOn = Array.isArray(args.depends_on) && args.depends_on.length > 0
        ? args.depends_on.map(String)
        : undefined;
      const conflictsWith = Array.isArray(args.conflicts_with) && args.conflicts_with.length > 0
        ? args.conflicts_with.map(String)
        : undefined;
      const parentSkillId = args.parent_skill_id ? String(args.parent_skill_id).trim() : undefined;

      let steps: SkillStep[] | undefined;
      if (Array.isArray(args.steps) && args.steps.length > 0) {
        steps = args.steps.map((s: unknown, i: number) => {
          const step = s as Record<string, unknown>;
          return {
            step: i + 1,
            action: String(step.action ?? ''),
            description: String(step.description ?? step.action ?? ''),
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
        lifecycle,
        trustTier,
        dependsOn,
        conflictsWith,
        parentSkillId,
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
      error:
        `Unknown operation: "${op}". Use "create", "update", "delete", "merge", "promote", "deprecate", "dependents", or "dependencies".`,
      errorInfo: {
        code: 'INVALID_OP',
        message: `Operation must be one of the supported values. Got: ${op}`,
        retryable: false,
      },
      durationMs: 0,
    };
  },
};
