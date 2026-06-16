import { fromFileUrl } from '@std/path';

export async function getVersion(): Promise<string> {
  try {
    const text = await Deno.readTextFile(
      fromFileUrl(new URL('../../VERSION', import.meta.url)),
    );
    return text.trim();
  } catch {
    try {
      const text = await Deno.readTextFile(
        fromFileUrl(new URL('../../deno.json', import.meta.url)),
      );
      const { version } = JSON.parse(text);
      if (version) return version;
    } catch {
      // fall through
    }
  }
  return '0.1.0';
}
