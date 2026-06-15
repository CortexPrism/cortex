export async function getVersion(): Promise<string> {
  try {
    const text = await Deno.readTextFile(
      new URL('../../VERSION', import.meta.url).pathname,
    );
    return text.trim();
  } catch {
    try {
      const text = await Deno.readTextFile(
        new URL('../../deno.json', import.meta.url).pathname,
      );
      const { version } = JSON.parse(text);
      if (version) return version;
    } catch {
      // fall through
    }
  }
  return '0.1.0';
}
