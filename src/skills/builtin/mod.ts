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

export const BUILTIN_SKILLS: BuiltinSkill[] = [
  cortexDevSkill,
  frontendDesignSkill,
];

export { cortexDevSkill, frontendDesignSkill };
