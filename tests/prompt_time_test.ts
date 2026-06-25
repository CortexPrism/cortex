import { assertStringIncludes } from '@std/assert';
import { buildSystemPrompt } from '../src/agent/soul.ts';
import { getBuiltinAgentDef } from '../src/agent/builtin-agents.ts';
import { SUB_AGENT_TYPES } from '../src/agent/sub-agent-types.ts';

Deno.test('soul - system prompt includes current time context', () => {
  const prompt = buildSystemPrompt('You are Cortex.', 'Extra context');

  assertStringIncludes(prompt, '## Current Time');
  assertStringIncludes(prompt, 'UTC now:');
  assertStringIncludes(prompt, 'Treat this as the current date/time');
});

Deno.test('research prompts include freshness guidance', () => {
  const researcher = getBuiltinAgentDef('researcher');

  assertStringIncludes(researcher?.soul ?? '', 'publication or update dates');
  assertStringIncludes(researcher?.soul ?? '', 'stale evidence');
  assertStringIncludes(SUB_AGENT_TYPES.research.systemPrompt, 'publication or update dates');
  assertStringIncludes(SUB_AGENT_TYPES.research.systemPrompt, 'stale');
});
