import { err, json, notFound, type RouteHandler } from './_helpers.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/vault\/list$/,
    handler: async () => {
      const { vaultList } = await import('../../../../../src/security/vault.ts');
      const entries = await vaultList();
      return json(entries);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/vault\/store$/,
    handler: async (req) => {
      const { vaultStore, vaultGet } = await import('../../../../../src/security/vault.ts');
      const body = await req.json() as {
        key: string;
        value: string;
        expiration?: string;
        maxUses?: number;
      };
      if (!body.key?.trim()) return err('Key name is required', 400);
      let existingService = 'vault';
      try {
        const existing = await vaultGet(body.key.trim(), 'system');
        if (existing) {
          const db2 = await import('../../../../../src/db/client.ts').then((m) => m.getVaultDb());
          const row = await db2.get<{ service: string }>(
            `SELECT service FROM vault_entries WHERE name = ?`,
            [body.key.trim()],
          );
          if (row?.service) existingService = row.service;
        }
      } catch { /* new credential */ }
      await vaultStore({
        name: body.key.trim(),
        service: existingService,
        value: body.value ?? '',
        credentialType: 'api_key',
      });
      if (body.expiration || body.maxUses !== undefined) {
        const db = await import('../../../../../src/db/client.ts').then((m) => m.getVaultDb());
        if (body.expiration) {
          let expiresAt: string;
          const exp = body.expiration;
          if (/^\d+[dmy]$/i.test(exp)) {
            const num = parseInt(exp);
            const unit = exp.slice(-1).toLowerCase();
            const multipliers: Record<string, number> = {
              d: 86_400_000,
              m: 2_592_000_000,
              y: 31_536_000_000,
            };
            expiresAt = new Date(Date.now() + num * (multipliers[unit] || 0)).toISOString();
          } else {
            expiresAt = exp;
          }
          await db.run(`UPDATE vault_entries SET expires_at = ? WHERE name = ?`, [
            expiresAt,
            body.key.trim(),
          ]);
        }
        if (body.maxUses !== undefined && body.maxUses > 0) {
          await db.run(`UPDATE vault_entries SET usage_limit = ? WHERE name = ?`, [
            body.maxUses,
            body.key.trim(),
          ]);
        }
      }
      return json({ ok: true });
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/vault\/delete\/(.+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/vault\/delete\/(.+)$/);
      if (!m) return notFound();
      const { vaultDelete } = await import('../../../../../src/security/vault.ts');
      const key = decodeURIComponent(m[1]);
      const ok = await vaultDelete(key);
      if (!ok) return notFound('Credential not found');
      return json({ ok: true });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/vault\/audit$/,
    handler: async () => {
      const db = await import('../../../../../src/db/client.ts').then((m) => m.getVaultDb());
      const rows = await db.all<{
        id: string;
        credential_id: string;
        requestor: string;
        granted: number;
        reason: string | null;
        accessed_at: string;
        name: string | null;
      }>(
        `SELECT al.id, al.credential_id, al.requestor, al.granted, al.reason, al.accessed_at, ve.name
         FROM vault_access_log al
         LEFT JOIN vault_entries ve ON ve.id = al.credential_id
         ORDER BY al.accessed_at DESC LIMIT 200`,
      );
      return json(rows.map((r) => ({
        ...r,
        key: r.name ?? r.credential_id,
        granted: r.granted === 1,
      })));
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/vault\/export$/,
    handler: async () => {
      const { vaultList, vaultGet } = await import('../../../../../src/security/vault.ts');
      const entries = await vaultList();
      const exported = [];
      for (const e of entries) {
        try {
          const value = await vaultGet(e.name, 'system');
          exported.push({ name: e.name, service: e.service, value });
        } catch {
          exported.push({
            name: e.name,
            service: e.service,
            value: null,
            error: 'decryption_failed',
          });
        }
      }
      return json(exported);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/vault\/import$/,
    handler: async (req) => {
      const { vaultStore } = await import('../../../../../src/security/vault.ts');
      const body = await req.json() as {
        data: Array<{ name: string; service?: string; value: string }>;
      };
      if (!Array.isArray(body.data)) return err('data must be an array', 400);
      let imported = 0;
      for (const item of body.data) {
        if (!item.name || !item.value) continue;
        await vaultStore({
          name: item.name,
          service: item.service || 'imported',
          value: item.value,
          credentialType: 'api_key',
        });
        imported++;
      }
      return json({ ok: true, imported });
    },
  },
];
