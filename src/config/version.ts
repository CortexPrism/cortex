import { fromFileUrl } from '@std/path';

let _version = '0.1.0';
try {
  const text = Deno.readTextFileSync(
    fromFileUrl(new URL('../../VERSION', import.meta.url)),
  );
  _version = text.trim();
} catch {
  try {
    const text = Deno.readTextFileSync(
      fromFileUrl(new URL('../../deno.json', import.meta.url)),
    );
    const { version } = JSON.parse(text);
    if (version) _version = version;
  } catch {
    // fall through
  }
}

export const VERSION = _version;

export const ONBOARDING_VERSION = '2.0';

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
  return VERSION;
}
