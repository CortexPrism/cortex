export interface BuiltinSkill {
  name: string;
  description: string;
  content: string;
  tags?: string[];
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  examples?: string[];
  prerequisites?: string[];
}

import { cortexDevSkill } from './cortex-dev.ts';
import { frontendDesignSkill } from './frontend-design.ts';

// Builtin skills are optional and can be loaded from .cortex/skills/ instead
// Users can add cortex-dev and frontend-design to their skills directory if needed
export const BUILTIN_SKILLS: BuiltinSkill[] = [];

export { cortexDevSkill, frontendDesignSkill };
