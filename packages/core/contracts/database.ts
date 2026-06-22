export type InValue = string | number | bigint | boolean | null | Uint8Array;

export interface IDbClient {
  init(): Promise<void>;
  exec(sql: string): Promise<void>;
  get<T = Record<string, unknown>>(sql: string, args?: InValue[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(sql: string, args?: InValue[]): Promise<T[]>;
  run(sql: string, args?: InValue[]): Promise<void>;
  insert(sql: string, args?: InValue[]): Promise<number>;
  close(): void;
}

export interface IMigration {
  db: IDbClient;
  sqlFile: string;
  label: string;
}
