import { type RouteHandler, json, err } from './_helpers.ts';
import {
  deleteSkills,
  deprecateSkill,
  getSkillByName,
  getSkillDependencies,
  getSkillDependents,
  getSkillHealth,
  getSkillStats,
  listSkills,
  loadHumanSkills,
  mergeSkill,
  promoteSkill,
  runSkillHealthMaintenance,
  storeSkill,
} from '../../../../../src/memory/skills.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/skills$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const origin = url.searchParams.get('origin') as 'human' | 'llm' | null;
      const lifecycle = url.searchParams.get('lifecycle') as
        | 'candidate'
        | 'verified'
        | 'released'
        | 'degraded'
        | 'deprecated'
        | 'archived'
        | null;
      const skills = await listSkills(50, origin ?? undefined, lifecycle ?? undefined);
      return json(skills);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/skills\/stats$/,
    handler: async () => {
      const stats = await getSkillStats();
      return json(stats);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/skills\/detail$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const name = url.searchParams.get('name');
      if (!name) return err('Missing skill name', 400);
      const skill = await getSkillByName(name);
      if (!skill) return err('Skill not found', 404);
      return json(skill);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/skills$/,
    handler: async (req) => {
      const body = await req.json() as {
        name: string;
        description?: string;
        triggerPattern?: string;
        content?: string;
        steps?: Array<
          { step: number; action: string; tool?: string; params?: Record<string, unknown> }
        >;
        metadata?: {
          tags?: string[];
          difficulty?: string;
          examples?: string[];
          prerequisites?: string[];
        };
      };
      if (!body.name?.trim()) return err('Missing name', 400);
      const id = await storeSkill({
        name: body.name,
        description: body.description,
        triggerPattern: body.triggerPattern,
        steps: body.steps
          ? body.steps.map((s) => ({
            step: s.step,
            action: s.action,
            description: s.action,
            tool: s.tool,
            params: s.params,
          }))
          : [{
            step: 1,
            action: body.content ?? body.description ?? '',
            description: body.content ?? body.description ?? '',
          }],
        origin: 'human',
        content: body.content ?? undefined,
        metadata: body.metadata
          ? {
            tags: body.metadata.tags,
            difficulty:
              (body.metadata.difficulty as 'beginner' | 'intermediate' | 'advanced' | undefined) ||
              undefined,
            examples: body.metadata.examples,
            prerequisites: body.metadata.prerequisites,
          }
          : undefined,
      });
      return json({ ok: true, id });
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/skills$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const names = url.searchParams.getAll('name');
      if (names.length === 0) {
        const body = await req.json().catch(() => ({})) as { names?: string[] };
        if (Array.isArray(body.names) && body.names.length > 0) {
          names.push(...body.names);
        }
      }
      if (names.length === 0) return err('Missing skill name(s)', 400);
      const result = await deleteSkills(names);
      return json({ ok: result.errors.length === 0, deleted: result.deleted, errors: result.errors });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/skills\/load-human$/,
    handler: async () => {
      const loaded = await loadHumanSkills();
      return json({ ok: true, loaded });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/skills\/export$/,
    handler: async (req) => {
      const { join } = await import('@std/path');
      const { ensureDir } = await import('@std/fs');
      const body = await req.json() as {
        name: string;
        description?: string;
        triggerPattern?: string;
        content?: string;
      };
      if (!body.name?.trim()) return err('Missing name', 400);
      const name = body.name.trim();
      const desc = body.description?.trim() ?? '';
      const trigger = body.triggerPattern?.trim();
      const content = body.content ?? '';
      let frontmatter = '---\nname: ' + name + '\ndescription: ' +
        (desc.length > 80 ? '>-\n  ' + desc : desc || '...');
      if (trigger) frontmatter += '\ntrigger_pattern: ' + trigger;
      frontmatter += '\n---\n\n';
      const dir = join(Deno.cwd(), '.cortex', 'skills', name);
      await ensureDir(dir);
      await Deno.writeTextFile(join(dir, 'SKILL.md'), frontmatter + content);
      return json({ ok: true, path: '.cortex/skills/' + name + '/SKILL.md' });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/skills\/merge$/,
    handler: async (req) => {
      const body = await req.json() as { target: string; source: string };
      if (!body.target?.trim() || !body.source?.trim()) {
        return err('Missing target or source skill name', 400);
      }
      try {
        const result = await mergeSkill(body.target.trim(), body.source.trim());
        return json({ ok: true, skill: result });
      } catch (e) {
        return err((e as Error).message, 400);
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/skills\/deprecate$/,
    handler: async (req) => {
      const body = await req.json() as { name: string; reason?: string };
      if (!body.name?.trim()) return err('Missing skill name', 400);
      const ok = await deprecateSkill(body.name.trim(), body.reason ?? 'Deprecated via API');
      if (!ok) return err('Skill not found', 404);
      return json({ ok: true });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/skills\/promote$/,
    handler: async (req) => {
      const body = await req.json() as { name: string };
      if (!body.name?.trim()) return err('Missing skill name', 400);
      const ok = await promoteSkill(body.name.trim());
      if (!ok) return err('Skill not found', 404);
      return json({ ok: true });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/skills\/dependencies$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const name = url.searchParams.get('name');
      if (!name) return err('Missing skill name', 400);
      const [dependents, dependencies] = await Promise.all([
        getSkillDependents(name),
        getSkillDependencies(name),
      ]);
      return json({ name, dependents, dependencies });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/skills\/bindings$/,
    handler: async () => {
      const { listSkillBindings, getSkillBusStatus, getRecentSkillBusEvents } = await import(
        '../../agent/skill-bus.ts'
      );
      const bindings = listSkillBindings();
      const status = getSkillBusStatus();
      const events = getRecentSkillBusEvents(30);
      const skillNames = new Set(bindings.map((b) => b.skillId));
      const skillMap = new Map<string, { name: string; description: string }>();
      for (const name of skillNames) {
        try {
          const skill = await getSkillByName(name);
          if (skill) skillMap.set(name, { name: skill.name, description: skill.description ?? '' });
        } catch { /* skip */ }
      }
      const enriched = bindings.map((b) => ({
        ...b,
        skill: skillMap.get(b.skillId) ?? { name: b.skillId, description: '' },
      }));
      return json({ bindings: enriched, status, events });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/skills\/health$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const name = url.searchParams.get('name');
      if (name) {
        const health = await getSkillHealth(name);
        if (!health) return err('Skill not found', 404);
        return json(health);
      }
      const result = await runSkillHealthMaintenance();
      return json(result);
    },
  },
];
