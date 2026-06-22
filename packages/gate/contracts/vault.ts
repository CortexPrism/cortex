export interface IVaultEntry {
  key: string;
  value: string;
  created_at: string;
  updated_at: string;
  expiration?: string;
  max_uses?: number;
  uses?: number;
}

export interface IVault {
  getSecret(key: string): Promise<string | null>;
  setSecret(key: string, value: string, opts?: Record<string, unknown>): Promise<void>;
  deleteSecret(key: string): Promise<void>;
  listSecrets(): Promise<string[]>;
  auditLog(limit?: number): Promise<IVaultEntry[]>;
  exportSecrets(): Promise<IVaultEntry[]>;
  importSecrets(entries: IVaultEntry[]): Promise<void>;
}
