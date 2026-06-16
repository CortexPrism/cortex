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

// New focused skills
import { planComplexTasksSkill } from './plan-complex-tasks.ts';
import { handleFailureRecoverySkill } from './handle-failure-recovery.ts';
import { reflectOnOutcomesSkill } from './reflect-on-outcomes.ts';
import { useEpisodicMemorySkill } from './use-episodic-memory.ts';
import { extractSemanticKnowledgeSkill } from './extract-semantic-knowledge.ts';
import { learnProceduralSkillsSkill } from './learn-procedural-skills.ts';
import { diagnoseAgentFailuresSkill } from './diagnose-agent-failures.ts';
import { profilePerformanceSkill } from './profile-performance.ts';
import { analyzeErrorsSkill } from './analyze-errors.ts';
import { designToolInterfaceSkill } from './design-tool-interface.ts';
import { testCodeReliabilitySkill } from './test-code-reliability.ts';
import { implementDatabaseChangesSkill } from './implement-database-changes.ts';

// Default Cortex skills - focused and actionable
export const BUILTIN_SKILLS: BuiltinSkill[] = [
  // Agent Reasoning
  planComplexTasksSkill,
  handleFailureRecoverySkill,
  reflectOnOutcomesSkill,
  // Memory & Learning
  useEpisodicMemorySkill,
  extractSemanticKnowledgeSkill,
  learnProceduralSkillsSkill,
  // System Operations
  diagnoseAgentFailuresSkill,
  profilePerformanceSkill,
  analyzeErrorsSkill,
  // Development
  designToolInterfaceSkill,
  testCodeReliabilitySkill,
  implementDatabaseChangesSkill,
];

// Legacy skills (from KiloCode IDE extension) - available for reference/loading if needed
export {
  cortexDevSkill,
  frontendDesignSkill,
  agentReasoningSkill,
  memorySystemsSkill,
  systemDebuggingSkill,
  toolIntegrationSkill,
  planComplexTasksSkill,
  handleFailureRecoverySkill,
  reflectOnOutcomesSkill,
  useEpisodicMemorySkill,
  extractSemanticKnowledgeSkill,
  learnProceduralSkillsSkill,
  diagnoseAgentFailuresSkill,
  profilePerformanceSkill,
  analyzeErrorsSkill,
  designToolInterfaceSkill,
  testCodeReliabilitySkill,
  implementDatabaseChangesSkill,
};
