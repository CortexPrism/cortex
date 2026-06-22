import { exists } from '@std/fs';
import { join } from '@std/path';

const LOCALES_DIR = Deno.args[0] || 'locales';
const REFERENCE_LOCALE = 'en';

function extractKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (key === '_meta') continue;
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...extractKeys(value as Record<string, unknown>, fullKey));
    } else if (typeof value === 'string') {
      keys.push(fullKey);
    }
  }
  return keys;
}

function getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (typeof current !== 'object' || current === null || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : undefined;
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: string): void {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in current) || typeof current[parts[i]] !== 'object') {
      current[parts[i]] = {};
    }
    current = current[parts[i]] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

async function main(): Promise<void> {
  const enPath = join(LOCALES_DIR, `${REFERENCE_LOCALE}.json`);
  if (!(await exists(enPath))) {
    console.error(`Reference locale not found: ${enPath}`);
    Deno.exit(1);
  }

  const enRaw = await Deno.readTextFile(enPath);
  const enObj = JSON.parse(enRaw);
  const enKeys = extractKeys(enObj);

  let synced = 0;

  for await (const entry of Deno.readDir(LOCALES_DIR)) {
    if (!entry.isFile || !entry.name.endsWith('.json')) continue;
    const locale = entry.name.replace('.json', '');
    if (locale === REFERENCE_LOCALE) continue;

    const filePath = join(LOCALES_DIR, entry.name);
    const raw = await Deno.readTextFile(filePath);
    const locObj = JSON.parse(raw);
    const locKeys = new Set(extractKeys(locObj));

    let changed = false;
    for (const key of enKeys) {
      if (!locKeys.has(key)) {
        const enVal = getNestedValue(enObj, key);
        setNestedValue(locObj, key, enVal ?? `__TODO__${key}__`);
        changed = true;
        synced++;
      }
    }

    if (changed) {
      await Deno.writeTextFile(filePath, JSON.stringify(locObj, null, 2) + '\n');
      console.log(`Synced ${locale}`);
    }
  }

  console.log(`Added ${synced} new keys across all locales`);
}

main().catch(console.error);
