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
import { agentReasoningSkill } from './agent-reasoning.ts';
import { memorySystemsSkill } from './memory-systems.ts';
import { systemDebuggingSkill } from './system-debugging.ts';
import { toolIntegrationSkill } from './tool-integration.ts';

// Default Cortex skills - focused on agent reasoning, learning, and system operation
export const BUILTIN_SKILLS: BuiltinSkill[] = [
  agentReasoningSkill,
  memorySystemsSkill,
  systemDebuggingSkill,
  toolIntegrationSkill,
];

// Legacy skills (from KiloCode IDE extension) - available for reference/loading if needed
export { cortexDevSkill, frontendDesignSkill, agentReasoningSkill, memorySystemsSkill, systemDebuggingSkill, toolIntegrationSkill };
