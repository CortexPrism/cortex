import { walk } from '@std/fs';
import { join } from '@std/path';

const SRC_DIR = join(Deno.args[0] || '.', 'src');
const I18N_CALL_RE = /i18n\.t\(\s*['"]([^'"]+)['"]/g;
const OUTPUT_PATH = Deno.args[1] || 'locales/en_extracted_keys.txt';

function extractKeysFromContent(content: string): string[] {
  const keys: string[] = [];
  let match;
  while ((match = I18N_CALL_RE.exec(content)) !== null) {
    keys.push(match[1]);
  }
  return keys;
}

async function main(): Promise<void> {
  const allKeys = new Set<string>();

  for await (const entry of walk(SRC_DIR, { exts: ['.ts'], skip: [/\.test\.ts$/] })) {
    try {
      const content = await Deno.readTextFile(entry.path);
      const keys = extractKeysFromContent(content);
      for (const key of keys) {
        allKeys.add(key);
      }
    } catch {
      // skip unreadable files
    }
  }

  const sorted = [...allKeys].sort();
  const output = sorted.join('\n') + '\n';
  await Deno.writeTextFile(OUTPUT_PATH, output);
  console.log(`Extracted ${sorted.length} keys to ${OUTPUT_PATH}`);
}

main().catch(console.error);
