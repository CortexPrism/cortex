/**
 * Human-in-the-Loop Approval System
 *
 * CLI and programmatic approval flows for sensitive data access
 */

import { bold, green, red, yellow } from '@std/fmt/colors';
import type { AccessRequest } from './supervisor.ts';

/**
 * Request human approval via CLI prompt
 *
 * @param req — Access request details
 * @param supervisorReasoning — AI supervisor's reasoning
 * @returns Promise<boolean> — true if approved, false if denied
 */
export async function requestHumanApproval(
  req: AccessRequest,
  supervisorReasoning: string,
): Promise<boolean> {
  console.log(yellow('\n⚠️  SECURITY APPROVAL REQUIRED\n'));
  console.log(
    `Agent "${req.agentId}" is requesting access to ${
      red(req.dataClassification.toUpperCase())
    } data.\n`,
  );
  console.log(`Tool: ${bold(req.tool)}`);
  console.log(`Query: ${req.query}`);
  console.log(`Justification: ${req.requestReason ?? '(none provided)'}\n`);
  console.log(`${bold('AI Supervisor Reasoning:')}\n${supervisorReasoning}\n`);

  // Prompt for approval
  await Deno.stdout.write(
    new TextEncoder().encode(
      `Allow this access? ${green('[y]')}es / ${red('[n]')}o / ${yellow('[d]')}etails: `,
    ),
  );

  const buf = new Uint8Array(16);
  const n = await Deno.stdin.read(buf);
  const answer = n ? new TextDecoder().decode(buf.subarray(0, n)).trim().toLowerCase() : '';

  // Handle details request
  if (answer === 'd' || answer === 'details') {
    // Show sample data if available
    if (req.sampleData) {
      console.log(`\n${bold('Sample Data:')}\n${req.sampleData}\n`);
    } else {
      console.log('\n(No sample data available)\n');
    }
    // Recurse to ask again
    return requestHumanApproval(req, supervisorReasoning);
  }

  const approved = answer === 'y' || answer === 'yes';

  if (approved) {
    console.log(green('✅ Access approved\n'));
  } else {
    console.log(red('❌ Access denied\n'));
  }

  return approved;
}

/**
 * Grant tracking for temporary approvals
 * Key: `${sessionId}:${tool}`
 */
interface Grant {
  sessionId: string;
  tool: string;
  expiresAt: number;
}

const grants = new Map<string, Grant>();

/**
 * Grant temporary access for a session+tool combination
 *
 * @param sessionId — Session identifier
 * @param tool — Tool name
 * @param durationMs — Grant duration in milliseconds (default: 1 hour)
 */
export function grantTemporaryAccess(
  sessionId: string,
  tool: string,
  durationMs = 60 * 60 * 1000,
): void {
  const key = `${sessionId}:${tool}`;
  grants.set(key, {
    sessionId,
    tool,
    expiresAt: Date.now() + durationMs,
  });
}

/**
 * Check if temporary access is granted
 *
 * @param sessionId — Session identifier
 * @param tool — Tool name
 * @returns boolean — true if grant exists and not expired
 */
export function hasTemporaryGrant(sessionId: string, tool: string): boolean {
  const key = `${sessionId}:${tool}`;
  const grant = grants.get(key);

  if (!grant) return false;

  // Check expiration
  if (Date.now() > grant.expiresAt) {
    grants.delete(key);
    return false;
  }

  return true;
}

/**
 * Revoke temporary access
 *
 * @param sessionId — Session identifier
 * @param tool — Tool name (optional, if omitted revokes all grants for session)
 */
export function revokeGrant(sessionId: string, tool?: string): void {
  if (tool) {
    const key = `${sessionId}:${tool}`;
    grants.delete(key);
  } else {
    // Revoke all grants for this session
    for (const [key, grant] of grants.entries()) {
      if (grant.sessionId === sessionId) {
        grants.delete(key);
      }
    }
  }
}

/**
 * List all active grants (for debugging/admin)
 */
export function listGrants(): Grant[] {
  const now = Date.now();
  const active: Grant[] = [];

  for (const [key, grant] of grants.entries()) {
    if (grant.expiresAt > now) {
      active.push(grant);
    } else {
      // Cleanup expired grants
      grants.delete(key);
    }
  }

  return active;
}

/**
 * Clear all grants (for testing or session cleanup)
 */
export function clearAllGrants(): void {
  grants.clear();
}
