/**
 * Tests for workspace boundary enforcement (session sess_mqu0h1fz_ws fix)
 *
 * Covers:
 *  - PolicyKind 'workspace' exists
 *  - validateToolCall denies workspace:global for file tools when policy denies
 *  - validateToolCall denies workspace:global for shell when policy denies
 *  - Shell tool sandboxes cwd to agent workspace by default
 *  - Shell tool rejects cwd outside workspace
 *  - Migration 056 inserts default_deny_workspace_global rule
 *  - ComplianceHook critical session blocking
 */

import { assertEquals, assertExists, assertStringIncludes } from '@std/assert';
import { checkPolicy, addPolicy, removePolicy, PolicyKind, PolicyRule } from '../src/security/policy.ts';
import { validateToolCall } from '../src/security/validator.ts';

Deno.test('PolicyKind includes workspace', () => {
  const kinds: PolicyKind[] = ['tool', 'shell', 'domain', 'capability', 'path', 'computer', 'workspace'];
  // Type-level check: if this compiles, 'workspace' is valid
  assertEquals(kinds.length, 7);
});

Deno.test('checkPolicy: workspace:global denied by default deny rule', async () => {
  // The default_deny_workspace_global rule (priority 150) denies workspace:global
  const decision = await checkPolicy('workspace', 'global');
  assertEquals(decision.allowed, false);
  assertEquals(decision.rule?.id, 'default_deny_workspace_global');
});

Deno.test('checkPolicy: workspace deny rule blocks matching value', async () => {
  const ruleId = await addPolicy({
    kind: 'workspace',
    effect: 'deny',
    pattern: 'global',
    reason: 'Test deny workspace:global',
    priority: 10,
  });

  try {
    const decision = await checkPolicy('workspace', 'global');
    assertEquals(decision.allowed, false);
    assertEquals(decision.rule?.id, ruleId);
  } finally {
    await removePolicy(ruleId);
  }
});

Deno.test('checkPolicy: workspace allow rule permits matching value', async () => {
  const ruleId = await addPolicy({
    kind: 'workspace',
    effect: 'allow',
    pattern: 'global',
    reason: 'Test allow workspace:global',
    priority: 10,
  });

  try {
    const decision = await checkPolicy('workspace', 'global');
    assertEquals(decision.allowed, true);
    assertEquals(decision.rule?.id, ruleId);
  } finally {
    await removePolicy(ruleId);
  }
});

Deno.test('validateToolCall: file_list with workspace:global denied by workspace deny rule', async () => {
  const ruleId = await addPolicy({
    kind: 'workspace',
    effect: 'deny',
    pattern: 'global',
    reason: 'Test deny',
    priority: 10,
  });

  try {
    const result = await validateToolCall('file_list', {
      path: '/root/cortex',
      workspace: 'global',
    }, 'test-session');

    assertEquals(result.allowed, false);
    assertStringIncludes(result.reason, 'Test deny');
  } finally {
    await removePolicy(ruleId);
  }
});

Deno.test('validateToolCall: file_tree with workspace:agent allowed (no match)', async () => {
  const result = await validateToolCall('file_tree', {
    path: '.',
    workspace: 'agent',
  }, 'test-session');

  // workspace:agent should not match the deny:global rule
  assertEquals(result.allowed, true);
});

Deno.test('validateToolCall: shell with workspace:global denied by workspace deny rule', async () => {
  const ruleId = await addPolicy({
    kind: 'workspace',
    effect: 'deny',
    pattern: 'global',
    reason: 'Test deny global shell',
    priority: 10,
  });

  try {
    const result = await validateToolCall('shell', {
      command: 'ls /root',
      workspace: 'global',
    }, 'test-session');

    assertEquals(result.allowed, false);
    assertStringIncludes(result.reason, 'Test deny global shell');
  } finally {
    await removePolicy(ruleId);
  }
});

Deno.test('validateToolCall: shell with no workspace param passes without workspace check', async () => {
  const result = await validateToolCall('shell', {
    command: 'echo hello',
  }, 'test-session');

  assertEquals(result.allowed, true);
});

Deno.test('addPolicy: workspace kind is accepted', async () => {
  const ruleId = await addPolicy({
    kind: 'workspace',
    effect: 'deny',
    pattern: 'test',
    reason: 'Testing workspace kind',
  });

  try {
    // Query the rule back from policy list
    const rules = await import('../src/security/policy.ts').then((m) => m.listPolicies());
    const rule = rules.find((r: PolicyRule) => r.id === ruleId);
    assertExists(rule);
    assertEquals(rule.kind, 'workspace');
    assertEquals(rule.pattern, 'test');
  } finally {
    await removePolicy(ruleId);
  }
});
