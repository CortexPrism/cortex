import { json, notFound, type RouteHandler } from './_helpers.ts';
import { getIdentity } from './auth-guard.ts';
import { requireInstanceAdmin } from '../guards.ts';
import { getCoreDb } from '../../db/client.ts';
import type { InValue } from 'npm:@libsql/client';

const PAIRING_TOKEN_TTL_MS = 60 * 60 * 1000;

async function getSwarmTransport() {
  try {
    const { createSwarmTransport } = await import(
      '../../packages/infra/src/swarm/transport.ts'
    );
    return createSwarmTransport();
  } catch {
    return null;
  }
}

async function getSwarmCoordinator() {
  try {
    const { swarm } = await import(
      '../../packages/infra/src/swarm/coordinator.ts'
    );
    return swarm;
  } catch {
    return null;
  }
}

// ── Instance Identity ──────────────────────────────────────────

async function getOrCreateInstanceIdentity(): Promise<{ id: string; publicKey: string; instanceName: string | null }> {
  const db = await getCoreDb();
  const existing = await db.get<{ id: string; public_key: string; instance_name: string | null }>(
    `SELECT id, public_key, instance_name FROM instance_identity LIMIT 1`,
  );
  if (existing) {
    return {
      id: existing.id,
      publicKey: existing.public_key,
      instanceName: existing.instance_name,
    };
  }

  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const spki = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  function toPem(b64: string, type: string): string {
    const lines = b64.match(/.{1,64}/g) ?? [];
    return `-----BEGIN ${type}-----\n${lines.join('\n')}\n-----END ${type}-----`;
  }

  const publicPem = toPem(btoa(String.fromCharCode(...new Uint8Array(spki))), 'PUBLIC KEY');
  const privatePem = toPem(
    btoa(String.fromCharCode(...new Uint8Array(pkcs8))),
    'PRIVATE KEY',
  );

  const hostname = (() => {
    try {
      const osHostname = Deno.hostname();
      return osHostname === 'localhost' || !osHostname ? null : osHostname;
    } catch {
      return null;
    }
  })();
  const instanceName = Deno.env.get('CORTEX_INSTANCE_NAME') ?? hostname ?? 'cortex';

  const id = `inst_${crypto.randomUUID()}`;
  await db.run(
    `INSERT INTO instance_identity (id, public_key, private_key_encrypted, instance_name, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    [id, publicPem, privatePem, instanceName],
  );

  return { id, publicKey: publicPem, instanceName };
}

// ── Route Handlers ─────────────────────────────────────────────

export const routes: RouteHandler[] = [
  // ── Instance Identity ───────────────────────────────────────
  {
    method: 'GET',
    pattern: /^\/api\/federation\/identity$/,
    handler: async (req) => {
      const identity = getIdentity(req);
      if (identity.type !== 'user') return json({ error: 'Authentication required' }, 401);
      try {
        const instIdentity = await getOrCreateInstanceIdentity();
        return json({
          id: instIdentity.id,
          publicKey: instIdentity.publicKey,
          instanceName: instIdentity.instanceName ?? null,
        });
      } catch {
        return json({ id: null, publicKey: null, error: 'Identity not yet generated' });
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/federation\/identity\/rotate$/,
    handler: async (req) => {
      const identity = getIdentity(req);
      if (identity.type !== 'user') return json({ error: 'Authentication required' }, 401);
      const guard = await requireInstanceAdmin(identity);
      if (guard) return guard;
      const db = await getCoreDb();
      const keyPair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify'],
      );
      const spki = await crypto.subtle.exportKey('spki', keyPair.publicKey);
      const pkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

      function toPem(b64: string, type: string): string {
        const lines = b64.match(/.{1,64}/g) ?? [];
        return `-----BEGIN ${type}-----\n${lines.join('\n')}\n-----END ${type}-----`;
      }
      const publicPem = toPem(btoa(String.fromCharCode(...new Uint8Array(spki))), 'PUBLIC KEY');
      const privatePem = toPem(
        btoa(String.fromCharCode(...new Uint8Array(pkcs8))),
        'PRIVATE KEY',
      );

      const existing = await db.get<{ id: string }>(
        `SELECT id FROM instance_identity LIMIT 1`,
      );
      if (existing) {
        await db.run(
          `UPDATE instance_identity SET public_key = ?, private_key_encrypted = ? WHERE id = ?`,
          [publicPem, privatePem, existing.id],
        );
        return json({ id: existing.id, publicKey: publicPem });
      }
      const hostname = (() => {
        try { return Deno.hostname(); } catch { return 'cortex'; }
      })();
      const instanceName = Deno.env.get('CORTEX_INSTANCE_NAME') ?? hostname;
      const id = `inst_${crypto.randomUUID()}`;
      await db.run(
        `INSERT INTO instance_identity (id, public_key, private_key_encrypted, instance_name, created_at)
         VALUES (?, ?, ?, ?, datetime('now'))`,
        [id, publicPem, privatePem, instanceName],
      );
      return json({ id, publicKey: publicPem });
    },
  },

  // ── Pairing Tokens ──────────────────────────────────────────
  {
    method: 'POST',
    pattern: /^\/api\/federation\/generate-pairing-token$/,
    handler: async (req) => {
      const identity = getIdentity(req);
      if (identity.type !== 'user') return json({ error: 'Authentication required' }, 401);
      const guard = await requireInstanceAdmin(identity);
      if (guard) return guard;
      const token = `cortex_pair_${crypto.randomUUID()}`;
      const id = `pair_${crypto.randomUUID()}`;
      const expiresAt = new Date(Date.now() + PAIRING_TOKEN_TTL_MS).toISOString();
      const db = await getCoreDb();
      await db.run(
        `INSERT INTO config (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [`pairing_token_${id}`, JSON.stringify({ token, expiresAt, used: false })],
      );
      return json({ id, token, expiresIn: '1 hour', expiresAt });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/federation\/pair$/,
    handler: async (req) => {
      const identity = getIdentity(req);
      if (identity.type !== 'user') return json({ error: 'Authentication required' }, 401);
      const guard = await requireInstanceAdmin(identity);
      if (guard) return guard;
      const body = await req.json() as {
        endpoint: string;
        pairing_token: string;
        peer_name?: string;
      };
      if (!body.endpoint || !body.pairing_token) {
        return json({ error: 'endpoint and pairing_token required' }, 400);
      }

      const db = await getCoreDb();

      // Validate pairing token
      const tokenKey = `pairing_token_${body.pairing_token}`;
      const tokenRow = await db.get<{ key: string; value: string }>(
        `SELECT key, value FROM config WHERE key LIKE 'pairing_token_%'`,
      );

      // Find matching token
      let validToken = false;
      try {
        const configRows = await db.all<{ key: string; value: string }>(
          `SELECT key, value FROM config WHERE key LIKE 'pairing_token_%'`,
        );
        for (const row of configRows) {
          try {
            const parsed = JSON.parse(row.value);
            if (parsed.token === body.pairing_token && !parsed.used) {
              if (parsed.expiresAt && new Date(parsed.expiresAt) < new Date()) {
                continue;
              }
              validToken = true;
              // Mark token as used
              await db.run(
                `UPDATE config SET value = ?, updated_at = datetime('now') WHERE key = ?`,
                [JSON.stringify({ ...parsed, used: true }), row.key],
              );
              break;
            }
          } catch { /* */ }
        }
      } catch { /* */ }

      if (!validToken) {
        return json({ error: 'Invalid or expired pairing token' }, 401);
      }

      // Exchange instance identities
      let peerPublicKey = 'pending_verification';
      try {
        const instIdentity = await getOrCreateInstanceIdentity();
        const resp = await fetch(`${body.endpoint.replace(/\/$/, '')}/api/federation/identity`, {
          headers: instIdentity.publicKey
            ? { 'x-cortex-pubkey': instIdentity.publicKey }
            : {},
        });
        if (resp.ok) {
          const peerIdentity = await resp.json() as { publicKey?: string };
          if (peerIdentity.publicKey) {
            peerPublicKey = peerIdentity.publicKey;
          }
        }
      } catch {
        // Key exchange is best-effort — manual verification possible later
      }

      const peerName = body.peer_name || body.endpoint;
      const id = `peer_${crypto.randomUUID()}`;
      await db.run(
        `INSERT INTO federation_peers (id, peer_name, endpoint, public_key, paired_at)
         VALUES (?, ?, ?, ?, datetime('now'))`,
        [id, peerName, body.endpoint, peerPublicKey] as InValue[],
      );

      // Attempt to register as a swarm node
      try {
        const swarmCoordinator = await getSwarmCoordinator();
        if (swarmCoordinator) {
          const instIdentity = await getOrCreateInstanceIdentity();
          await swarmCoordinator.registerSelf({
            name: instIdentity.instanceName ?? 'cortex',
            host: body.endpoint,
            port: 0,
            tier: 'unprivileged',
            a2aEndpoint: body.endpoint,
          });
        }
      } catch { /* best-effort */ }

      return json({ id, peerName, endpoint: body.endpoint }, 201);
    },
  },

  // ── Peers ────────────────────────────────────────────────────
  {
    method: 'GET',
    pattern: /^\/api\/federation\/peers$/,
    handler: async (req) => {
      const identity = getIdentity(req);
      if (identity.type !== 'user') return json({ error: 'Authentication required' }, 401);
      const db = await getCoreDb();
      const peers = await db.all(
        `SELECT * FROM federation_peers WHERE revoked_at IS NULL ORDER BY paired_at DESC`,
      );
      return json(peers);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/federation\/peers\/([^/]+)$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/federation\/peers\/([^/]+)$/);
      if (!m) return notFound();
      const identity = getIdentity(req);
      if (identity.type !== 'user') return json({ error: 'Authentication required' }, 401);
      const db = await getCoreDb();
      const peer = await db.get<Record<string, unknown>>(
        `SELECT * FROM federation_peers WHERE id = ? AND revoked_at IS NULL`,
        [m[1]],
      );
      if (!peer) return notFound('Peer not found');
      return json(peer);
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/federation\/peers\/([^/]+)$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/federation\/peers\/([^/]+)$/);
      if (!m) return notFound();
      const identity = getIdentity(req);
      if (identity.type !== 'user') return json({ error: 'Authentication required' }, 401);
      const guard = await requireInstanceAdmin(identity);
      if (guard) return guard;
      const db = await getCoreDb();
      await db.run(
        `UPDATE federation_peers SET revoked_at = datetime('now') WHERE id = ?`,
        [m[1]],
      );
      return json({ ok: true });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/federation\/peers\/([^/]+)\/ping$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/federation\/peers\/([^/]+)\/ping$/);
      if (!m) return notFound();
      const identity = getIdentity(req);
      if (identity.type !== 'user') return json({ error: 'Authentication required' }, 401);
      const db = await getCoreDb();
      const peer = await db.get<{ endpoint: string }>(
        `SELECT endpoint FROM federation_peers WHERE id = ? AND revoked_at IS NULL`,
        [m[1]],
      );
      if (!peer) return notFound('Peer not found');

      try {
        const resp = await fetch(`${peer.endpoint.replace(/\/$/, '')}/api/health`, {
          signal: AbortSignal.timeout(5000),
        });
        return json({ reachable: resp.ok, status: resp.status });
      } catch {
        return json({ reachable: false, error: 'Connection failed' });
      }
    },
  },

  // ── Remote Agent Discovery ───────────────────────────────────
  {
    method: 'GET',
    pattern: /^\/api\/federation\/peers\/([^/]+)\/agents$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/federation\/peers\/([^/]+)\/agents$/);
      if (!m) return notFound();
      const identity = getIdentity(req);
      if (identity.type !== 'user') return json({ error: 'Authentication required' }, 401);
      const db = await getCoreDb();
      const peer = await db.get<{ endpoint: string }>(
        `SELECT endpoint FROM federation_peers WHERE id = ? AND revoked_at IS NULL`,
        [m[1]],
      );
      if (!peer) return notFound('Peer not found');

      try {
        const endpoint = peer.endpoint.replace(/\/$/, '');
        const resp = await fetch(`${endpoint}/.well-known/agent-card.json`, {
          signal: AbortSignal.timeout(10000),
        });
        if (resp.ok) {
          const card = await resp.json() as Record<string, unknown>;
          const agents = (card.agents as Array<Record<string, unknown>>) ?? [];
          return json({ agents, source: 'agent_card' });
        }

        const transport = await getSwarmTransport();
        if (transport) {
          try {
            const card = await transport.fetchRemoteAgentCard(endpoint);
            if (card && card.agents) {
              return json({ agents: card.agents as unknown[], source: 'a2a' });
            }
          } catch { /* */ }
        }

        return json({ agents: [], note: 'No agents discoverable from remote peer' });
      } catch (e) {
        return json({ agents: [], error: (e as Error).message });
      }
    },
  },

  // ── Swarm Integration ────────────────────────────────────────
  {
    method: 'GET',
    pattern: /^\/api\/federation\/status$/,
    handler: async (req) => {
      const identity = getIdentity(req);
      if (identity.type !== 'user') return json({ error: 'Authentication required' }, 401);
      const db = await getCoreDb();
      const [peers, instIdentity, swarmNodes] = await Promise.all([
        db.all(`SELECT COUNT(*) as cnt FROM federation_peers WHERE revoked_at IS NULL`),
        db.get<{ id: string; instance_name: string | null }>(
          `SELECT id, instance_name FROM instance_identity LIMIT 1`,
        ).catch(() => null),
        (async () => {
          try {
            const coordinator = await getSwarmCoordinator();
            if (coordinator) return await coordinator.listNodes();
          } catch { /* */ }
          return [];
        })(),
      ]);

      return json({
        pairedPeers: (peers[0] as { cnt: number })?.cnt ?? 0,
        instanceName: instIdentity?.instance_name ?? null,
        instanceId: instIdentity?.id ?? null,
        swarmNodes: (swarmNodes ?? []).length,
      });
    },
  },
];
