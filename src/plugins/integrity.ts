const encoder = new TextEncoder();

export async function computeSha256(content: string | Uint8Array): Promise<string> {
  const bytes = typeof content === 'string' ? encoder.encode(content) : content;
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function verifyIntegrity(content: string | Uint8Array, expectedHash: string): Promise<boolean> {
  const bytes = typeof content === 'string' ? encoder.encode(content) : content;
  return computeSha256(bytes).then((hash) => hash === expectedHash).catch(() => false);
}

export async function verifyEntryPointIntegrity(
  entryPoint: string,
  expectedHash: string | null,
): Promise<{ valid: boolean; hash: string | null }> {
  if (!expectedHash) return { valid: true, hash: null };

  try {
    const content = entryPoint.startsWith('http')
      ? await (await fetch(entryPoint)).text()
      : await Deno.readTextFile(entryPoint);

    const hash = await computeSha256(content);
    return { valid: hash === expectedHash, hash };
  } catch (e) {
    return { valid: false, hash: null };
  }
}

export async function generateIntegrityHash(entryPoint: string): Promise<string | null> {
  try {
    const content = entryPoint.startsWith('http')
      ? await (await fetch(entryPoint)).text()
      : await Deno.readTextFile(entryPoint);
    return await computeSha256(content);
  } catch {
    return null;
  }
}
