/**
 * Shared test helpers for CortexPrism tests.
 * Provides temp DB, session mocking, and utility functions.
 */
import { Db } from '../src/db/client.ts';
import { join } from '@std/path';

export async function makeTempDb(): Promise<{ db: Db; dir: string; close: () => void }> {
  const dir = await Deno.makeTempDir();
  const dbPath = join(dir, 'test.db');
  const db = new Db(dbPath);
  await db.init();
  return { db, dir, close: () => { db.close(); } };
}

export async function initSessionSchema(db: Db): Promise<void> {
  const sql = await Deno.readTextFile(
    join(import.meta.dirname!, '..', 'src', 'db', 'migrations', '006_session.sql'),
  );
  await db.exec(sql);
}

export function makeMockSessionId(prefix = 'test'): string {
  return `sess_${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function makeMockTurnId(): string {
  return `turn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function captureLogs(): { output: string[]; restore: () => void } {
  const output: string[] = [];
  const orig = console.log;
  console.log = (...args: unknown[]) => {
    output.push(args.map(String).join(' '));
  };
  return {
    output,
    restore: () => { console.log = orig; },
  };
}
