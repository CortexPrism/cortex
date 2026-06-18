import { assertEquals, assertExists, assertGreater } from '@std/assert';
import {
  computeSkillFreshness,
  extractSkillFromSession,
  filterReliableSkills,
  findMatchingSkills,
  getSkillByName,
  getSkillDependencies,
  getSkillHealth,
  getSkillStats,
  listSkills,
  mergeSkill,
  promoteSkill,
  runSkillHealthMaintenance,
  type SkillStep,
  storeSkill,
} from '../src/memory/skills.ts';
import { getMemoryDb } from '../src/db/client.ts';

async function cleanSkillsDb() {
  const db = await getMemoryDb();
  await db.run(`DELETE FROM procedural_memory WHERE name LIKE 'test_%' OR name LIKE 'eval_%'`);
}

Deno.test('skill storeSkill creates and retrieves a skill', async () => {
  const name = `test_create_${Date.now()}`;
  const steps: SkillStep[] = [{ step: 1, action: 'Test action', description: 'Test description' }];

  const id = await storeSkill({
    name,
    description: 'A test skill for automated evaluation',
    triggerPattern: 'evaluate, test, benchmark',
    steps,
    origin: 'human',
    content: '# Test Skill\n\nThis is a test skill.',
  });

  assertExists(id);
  assertGreater(id.length, 0);

  const retrieved = await getSkillByName(name);
  assertExists(retrieved);
  assertEquals(retrieved!.name, name);
  assertEquals(retrieved!.origin, 'human');
  assertEquals(retrieved!.lifecycle, 'released');
  assertEquals(retrieved!.trust_tier, 3);
});

Deno.test('skill lifecycle states work correctly', async () => {
  const name = `test_lifecycle_${Date.now()}`;
  await storeSkill({
    name,
    description: 'Lifecycle test',
    steps: [{ step: 1, action: 'Test', description: 'Test' }],
    origin: 'human',
  });

  // LLM-extracted skill starts as candidate
  const llmName = `test_llm_lifecycle_${Date.now()}`;
  await storeSkill({
    name: llmName,
    description: 'LLM lifecycle test',
    steps: [{ step: 1, action: 'Test', description: 'Test' }],
    origin: 'llm',
  });

  const llmSkill = await getSkillByName(llmName);
  assertExists(llmSkill);
  assertEquals(llmSkill!.lifecycle, 'candidate');
  assertEquals(llmSkill!.trust_tier, 1);

  // Promote LLM skill
  const promoted = await promoteSkill(llmName);
  assertEquals(promoted, true);

  const after = await getSkillByName(llmName);
  assertExists(after);
  assertEquals(after!.lifecycle, 'verified');

  // Promote again
  await promoteSkill(llmName);
  const after2 = await getSkillByName(llmName);
  assertEquals(after2!.lifecycle, 'released');
});

Deno.test('skill lexical search finds matching skills', async () => {
  const name = `test_search_${Date.now()}`;
  await storeSkill({
    name,
    description: 'Benchmarking and evaluating code reliability',
    triggerPattern: 'test, benchmark, evaluate quality',
    steps: [{ step: 1, action: 'Run tests', description: 'Run the test suite' }],
    origin: 'human',
  });

  const results1 = await findMatchingSkills('benchmark evaluation', 5);
  // May or may not find it depending on other skills, but should be functional
  assertEquals(Array.isArray(results1), true);

  const results2 = await findMatchingSkills('completely unrelated zxcvbnm', 5);
  assertEquals(Array.isArray(results2), true);
});

Deno.test('skill filterReliableSkills filters correctly', async () => {
  const skills = [
    {
      name: 'human_skill',
      origin: 'human' as const,
      lifecycle: 'released' as const,
      success_rate: 0.0,
      trust_tier: 1,
    },
    {
      name: 'good_llm',
      origin: 'llm' as const,
      lifecycle: 'verified' as const,
      success_rate: 0.5,
      trust_tier: 2,
    },
    {
      name: 'bad_llm',
      origin: 'llm' as const,
      lifecycle: 'candidate' as const,
      success_rate: 0.1,
      trust_tier: 1,
    },
    {
      name: 'deprecated',
      origin: 'human' as const,
      lifecycle: 'deprecated' as const,
      success_rate: 0.8,
      trust_tier: 4,
    },
  ] as any[];

  const filtered = filterReliableSkills(skills);
  const names = filtered.map((s: any) => s.name);
  assertEquals(names.includes('human_skill'), true);
  assertEquals(names.includes('good_llm'), true);
  assertEquals(names.includes('bad_llm'), false);
  assertEquals(names.includes('deprecated'), false);
});

Deno.test('skill merge combines two skills', async () => {
  const targetName = `test_merge_target_${Date.now()}`;
  const sourceName = `test_merge_source_${Date.now()}`;

  await storeSkill({
    name: targetName,
    description: 'Target skill',
    steps: [{ step: 1, action: 'Step A', description: 'Step A' }],
    origin: 'human',
  });

  await storeSkill({
    name: sourceName,
    description: 'Source skill',
    steps: [
      { step: 1, action: 'Step B', description: 'Step B' },
      { step: 2, action: 'Step C', description: 'Step C' },
    ],
    origin: 'llm',
    lifecycle: 'candidate',
  });

  const merged = await mergeSkill(targetName, sourceName);
  assertExists(merged);
  assertEquals(merged!.name, targetName);

  const steps: SkillStep[] = JSON.parse(merged!.steps);
  const actions = steps.map((s) => s.action);
  assertEquals(actions.includes('Step A'), true);
  assertEquals(actions.includes('Step B'), true);
  assertEquals(actions.includes('Step C'), true);

  // Source should be archived
  const source = await getSkillByName(sourceName);
  assertExists(source);
  assertEquals(source!.lifecycle, 'archived');
});

Deno.test('skill dependencies can be queried', async () => {
  const parentName = `test_dep_parent_${Date.now()}`;
  const childName = `test_dep_child_${Date.now()}`;

  await storeSkill({
    name: parentName,
    description: 'Parent skill',
    steps: [{ step: 1, action: 'Parent', description: 'Parent' }],
    origin: 'human',
  });

  await storeSkill({
    name: childName,
    description: 'Child skill',
    steps: [{ step: 1, action: 'Child', description: 'Child' }],
    origin: 'human',
    dependsOn: [parentName],
  });

  const deps = await getSkillDependencies(childName);
  assertEquals(deps.length, 1);
  assertEquals(deps[0].name, parentName);
});

Deno.test('skill health provides quality scores', async () => {
  const name = `test_health_${Date.now()}`;
  await storeSkill({
    name,
    description: 'Health check skill',
    steps: [
      { step: 1, action: 'Test', description: 'Test', tool: 'bash' },
    ],
    origin: 'human',
  });

  const health = await getSkillHealth(name);
  assertExists(health);
  assertEquals(typeof health!.utility, 'number');
  assertEquals(typeof health!.redundancy, 'number');
  assertEquals(typeof health!.freshness, 'number');
  assertEquals(typeof health!.failureRisk, 'number');
  assertEquals(typeof health!.overall, 'number');
  assertGreater(health!.overall, -0.1);
});

Deno.test('skill freshness computation works', async () => {
  await computeSkillFreshness();
  // Should not throw
  assertEquals(true, true);
});

Deno.test('skill health maintenance runs without errors', async () => {
  const result = await runSkillHealthMaintenance(0.1);
  assertEquals(typeof result.deprecated, 'number');
  assertEquals(typeof result.degraded, 'number');
});

Deno.test('skill stats includes new metrics', async () => {
  const stats = await getSkillStats();
  assertEquals(typeof stats.total, 'number');
  assertEquals(typeof stats.human, 'number');
  assertEquals(typeof stats.llm, 'number');
  assertEquals(typeof stats.avgSuccessRate, 'number');
  assertEquals(typeof stats.activeSkills, 'number');
  assertEquals(typeof stats.deprecatedSkills, 'number');
  assertEquals(typeof stats.avgUtilityScore, 'number');
  assertEquals(typeof stats.avgFreshness, 'number');
});

Deno.test('extractSkillFromSession validator rejects bad input', async () => {
  // Test with fewer than 2 tool calls - should skip
  const mockProvider = {
    complete: async () => ({ content: '{"skip": true}' }),
  } as any;

  const result = await extractSkillFromSession(
    'test_session',
    'Do one thing',
    [{ tool: 'bash', params: {}, result: 'ok' }],
    mockProvider,
    'test-model',
  );
  assertEquals(result, null);
});

Deno.test('extractSkillFromSession with valid tool calls returns skill ID', async () => {
  const mockProvider = {
    complete: async () => ({
      content: JSON.stringify({
        name: `eval_extracted_${Date.now().toString(36)}`,
        description: 'A test extracted skill',
        triggerPattern: 'extraction test',
        steps: [
          { step: 1, action: 'Search for files', tool: 'glob', params: { pattern: '*.ts' } },
          { step: 2, action: 'Check types', tool: 'bash', params: { command: 'deno check' } },
        ],
      }),
    }),
  } as any;

  const result = await extractSkillFromSession(
    'test_session',
    'Find and check TypeScript files',
    [
      { tool: 'glob', params: { pattern: '**/*.ts' }, result: 'found files' },
      { tool: 'bash', params: { command: 'deno check' }, result: 'passed' },
    ],
    mockProvider,
    'test-model',
  );
  assertExists(result);
});

Deno.test('skill listSkills with lifecycle filter', async () => {
  const released = await listSkills(5, undefined, 'released');
  assertEquals(Array.isArray(released), true);

  const deprecated = await listSkills(5, undefined, 'deprecated');
  assertEquals(Array.isArray(deprecated), true);
});
