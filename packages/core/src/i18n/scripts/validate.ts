import { exists } from '@std/fs';
import { join } from '@std/path';

const LOCALES_DIR = Deno.args[0] || 'locales';
const REFERENCE_LOCALE = 'en';

interface LocaleResult {
  locale: string;
  status: 'ok' | 'missing' | 'extra' | 'error';
  missingKeys: string[];
  extraKeys: string[];
  error?: string;
}

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

function keySetToString(keys: string[]): string {
  return [...keys].sort().join('\n');
}

async function validateLocale(
  locale: string,
  referenceKeys: Set<string>,
): Promise<LocaleResult> {
  const filePath = join(LOCALES_DIR, `${locale}.json`);

  if (!(await exists(filePath))) {
    return {
      locale,
      status: 'missing',
      missingKeys: [...referenceKeys],
      extraKeys: [],
      error: `File not found: ${filePath}`,
    };
  }

  try {
    const raw = await Deno.readTextFile(filePath);
    const parsed = JSON.parse(raw);
    const localeKeys = new Set(extractKeys(parsed));

    const missing = [...referenceKeys].filter((k) => !localeKeys.has(k));
    const extra = [...localeKeys].filter((k) => !referenceKeys.has(k));

    if (missing.length === 0 && extra.length === 0) {
      return { locale, status: 'ok', missingKeys: [], extraKeys: [] };
    }

    return {
      locale,
      status: missing.length > 0 && extra.length > 0 ? 'extra' : 'missing',
      missingKeys: missing,
      extraKeys: extra,
    };
  } catch (e) {
    return {
      locale,
      status: 'error',
      missingKeys: [],
      extraKeys: [],
      error: (e as Error).message,
    };
  }
}

async function main(): Promise<void> {
  const refPath = join(LOCALES_DIR, `${REFERENCE_LOCALE}.json`);
  if (!(await exists(refPath))) {
    console.error(`Reference locale file not found: ${refPath}`);
    Deno.exit(1);
  }

  const raw = await Deno.readTextFile(refPath);
  const refObj = JSON.parse(raw);
  const referenceKeys = new Set(extractKeys(refObj));

  console.log(`Reference locale (${REFERENCE_LOCALE}): ${referenceKeys.size} keys`);

  const results: LocaleResult[] = [];
  let hasErrors = false;

  for await (const entry of Deno.readDir(LOCALES_DIR)) {
    if (!entry.isFile || !entry.name.endsWith('.json')) continue;
    const locale = entry.name.replace('.json', '');
    if (locale === REFERENCE_LOCALE) continue;

    const result = await validateLocale(locale, referenceKeys);
    results.push(result);

    if (result.status !== 'ok') {
      hasErrors = true;
      console.log(`\n${locale}: ${result.status}`);
      if (result.error) {
        console.log(`  Error: ${result.error}`);
      }
      if (result.missingKeys.length > 0) {
        console.log(`  Missing keys: ${result.missingKeys.length}`);
        for (const key of result.missingKeys) {
          console.log(`    - ${key}`);
        }
      }
      if (result.extraKeys.length > 0) {
        console.log(`  Extra keys: ${result.extraKeys.length}`);
        for (const key of result.extraKeys) {
          console.log(`    + ${key}`);
        }
      }
    }
  }

  if (results.length === 0) {
    console.log('No other locale files found.');
    Deno.exit(0);
  }

  const okCount = results.filter((r) => r.status === 'ok').length;
  console.log(`\n${okCount}/${results.length} locales valid`);

  if (hasErrors) {
    Deno.exit(1);
  }
}

main().catch(console.error);
