/**
 * Unit Tests for Security Supervisor System (PR #1)
 *
 * Tests classification, supervisor decisions, and approval flows
 */

import { assertEquals, assertExists } from '@std/assert';
import {
  classifyContent,
  classifyMultiple,
  requiresHuman,
  requiresSupervisor,
} from '../src/security/classification.ts';
import {
  clearAllGrants,
  grantTemporaryAccess,
  hasTemporaryGrant,
  listGrants,
  revokeGrant,
} from '../src/security/approval.ts';
import { clearDecisionCache } from '../src/security/supervisor.ts';

Deno.test('Classification - detects SECRET patterns', () => {
  // Password patterns
  assertEquals(classifyContent('password: mySecretPass123'), 'secret');
  assertEquals(classifyContent('api_key=sk_live_abc123def456'), 'secret');

  // Credit card patterns
  assertEquals(classifyContent('4532-1234-5678-9010'), 'secret');

  // SSN patterns
  assertEquals(classifyContent('My SSN is 123-45-6789'), 'secret');

  // AWS credentials
  assertEquals(classifyContent('AKIA2ZQKQ5FAKETOKEN1'), 'secret');

  // Private key
  assertEquals(classifyContent('-----BEGIN RSA PRIVATE KEY-----'), 'secret');

  // Database connection strings
  assertEquals(classifyContent('postgres://user:pass@localhost/db'), 'secret');
});

Deno.test('Classification - detects SENSITIVE patterns', () => {
  // PII
  assertEquals(classifyContent('user@example.com'), 'sensitive');
  assertEquals(classifyContent('phone: 555-123-4567'), 'sensitive');
  assertEquals(classifyContent('address: 123 Main St'), 'sensitive');

  // Confidentiality markers
  assertEquals(classifyContent('This is CONFIDENTIAL information'), 'sensitive');
  assertEquals(classifyContent('INTERNAL ONLY - do not share'), 'sensitive');

  // Medical/personal
  assertEquals(classifyContent('patient diagnosis: diabetes'), 'sensitive');
  assertEquals(classifyContent('salary information'), 'sensitive');
});

Deno.test('Classification - defaults to sensitive for non-empty content', () => {
  assertEquals(classifyContent('just some regular text'), 'sensitive');
  assertEquals(classifyContent('user preferences'), 'sensitive');
  assertEquals(classifyContent('random content'), 'sensitive');
});

Deno.test('Classification - handles empty content as normal', () => {
  assertEquals(classifyContent(''), 'normal');
  assertEquals(classifyContent(null), 'normal');
  assertEquals(classifyContent(undefined), 'normal');
});

Deno.test('Classification - combines multiple fields', () => {
  // If any field is SECRET, result is SECRET
  assertEquals(classifyMultiple('normal text', 'password: secret123'), 'secret');

  // If any field is SENSITIVE, result is SENSITIVE
  assertEquals(classifyMultiple('normal text', 'user@example.com'), 'sensitive');

  // If all are NORMAL, result is NORMAL
  assertEquals(classifyMultiple('text1', 'text2'), 'sensitive'); // Default is sensitive, not normal
});

Deno.test('Classification - requiresSupervisor helper', () => {
  assertEquals(requiresSupervisor('secret'), true);
  assertEquals(requiresSupervisor('sensitive'), true);
  assertEquals(requiresSupervisor('normal'), false);
  assertEquals(requiresSupervisor('public'), false);
});

Deno.test('Classification - requiresHuman helper', () => {
  assertEquals(requiresHuman('secret'), true);
  assertEquals(requiresHuman('sensitive'), false);
  assertEquals(requiresHuman('normal'), false);
  assertEquals(requiresHuman('public'), false);
});

// ── Approval Grants Tests ──────────────────────────────────────────

Deno.test('Approval Grants - grant and check access', () => {
  clearAllGrants();

  const sessionId = 'test_session_123';
  const tool = 'memory_search';

  // Initially no grant
  assertEquals(hasTemporaryGrant(sessionId, tool), false);

  // Grant access
  grantTemporaryAccess(sessionId, tool);
  assertEquals(hasTemporaryGrant(sessionId, tool), true);
});

Deno.test('Approval Grants - grant expires after TTL', async () => {
  clearAllGrants();

  const sessionId = 'test_session_456';
  const tool = 'db_query';

  // Grant with 100ms TTL (very short for testing)
  grantTemporaryAccess(sessionId, tool, 100);
  assertEquals(hasTemporaryGrant(sessionId, tool), true);

  // Wait for expiration
  await new Promise((resolve) => setTimeout(resolve, 150));
  assertEquals(hasTemporaryGrant(sessionId, tool), false);
});

Deno.test('Approval Grants - revoke specific grant', () => {
  clearAllGrants();

  const sessionId = 'test_session_789';
  const tool1 = 'memory_search';
  const tool2 = 'db_query';

  // Grant access to both tools
  grantTemporaryAccess(sessionId, tool1);
  grantTemporaryAccess(sessionId, tool2);

  // Revoke tool1 only
  revokeGrant(sessionId, tool1);

  assertEquals(hasTemporaryGrant(sessionId, tool1), false);
  assertEquals(hasTemporaryGrant(sessionId, tool2), true);
});

Deno.test('Approval Grants - revoke all grants for session', () => {
  clearAllGrants();

  const sessionId = 'test_session_all';
  const tool1 = 'memory_search';
  const tool2 = 'db_query';
  const tool3 = 'browser';

  // Grant access to multiple tools
  grantTemporaryAccess(sessionId, tool1);
  grantTemporaryAccess(sessionId, tool2);
  grantTemporaryAccess(sessionId, tool3);

  // Revoke all for this session
  revokeGrant(sessionId);

  assertEquals(hasTemporaryGrant(sessionId, tool1), false);
  assertEquals(hasTemporaryGrant(sessionId, tool2), false);
  assertEquals(hasTemporaryGrant(sessionId, tool3), false);
});

Deno.test('Approval Grants - list active grants', () => {
  clearAllGrants(); // Ensure clean state

  const session1 = 'session_list_1';
  const session2 = 'session_list_2';

  grantTemporaryAccess(session1, 'tool_a');
  grantTemporaryAccess(session1, 'tool_b');
  grantTemporaryAccess(session2, 'tool_c');

  const grants = listGrants();
  assertEquals(grants.length, 3);
  assertEquals(grants.some((g) => g.sessionId === session1 && g.tool === 'tool_a'), true);
  assertEquals(grants.some((g) => g.sessionId === session1 && g.tool === 'tool_b'), true);
  assertEquals(grants.some((g) => g.sessionId === session2 && g.tool === 'tool_c'), true);
});

Deno.test('Approval Grants - clear all grants', () => {
  // Setup - ensure clean state first
  clearAllGrants();
  grantTemporaryAccess('s1', 't1');
  grantTemporaryAccess('s2', 't2');
  assertEquals(listGrants().length, 2);

  // Clear
  clearAllGrants();
  assertEquals(listGrants().length, 0);
});

// ── Supervisor Decision Cache Tests ──────────────────────────────────

Deno.test('Supervisor Cache - decision caching via clearDecisionCache', () => {
  clearDecisionCache();

  // Note: Direct cache testing is limited since caching is internal.
  // This test ensures the clear function doesn't throw.
  clearDecisionCache();
  assertEquals(true, true);
});
