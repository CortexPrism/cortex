const PRIVATE_IPV4_RANGES: Array<{ prefix: number[]; mask: number[] }> = [
  { prefix: [127, 0, 0, 0], mask: [255, 0, 0, 0] },
  { prefix: [10, 0, 0, 0], mask: [255, 0, 0, 0] },
  { prefix: [172, 16, 0, 0], mask: [255, 240, 0, 0] },
  { prefix: [192, 168, 0, 0], mask: [255, 255, 0, 0] },
  { prefix: [169, 254, 0, 0], mask: [255, 255, 0, 0] },
  { prefix: [0, 0, 0, 0], mask: [255, 0, 0, 0] },
];

function isPrivateIPv4(octets: number[]): boolean {
  for (const range of PRIVATE_IPV4_RANGES) {
    let match = true;
    for (let i = 0; i < 4; i++) {
      if ((octets[i] & range.mask[i]) !== range.prefix[i]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

function isPrivateIPv6(addr: string): boolean {
  const normalized = addr.toLowerCase();
  if (normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('fe80')) return true;
  return false;
}

function parseIPv4(str: string): number[] | null {
  const parts = str.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map(Number);
  if (octets.some((o) => isNaN(o) || o < 0 || o > 255)) return null;
  return octets;
}

const BLOCKED_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  '169.254.169.254',
  '0.0.0.0',
]);

function isPrivateHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(lower)) return true;
  if (lower.endsWith('.local') || lower.endsWith('.internal')) return true;
  const ipv4 = parseIPv4(lower);
  if (ipv4 && isPrivateIPv4(ipv4)) return true;
  if (lower.includes(':') && isPrivateIPv6(lower)) return true;
  return false;
}

export function isPrivateHost(hostname: string): boolean {
  return isPrivateHostname(hostname);
}

export async function resolveAndCheck(url: string): Promise<{ valid: boolean; error?: string }> {
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    return { valid: false, error: 'URL must start with http:// or https://' };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  if (isPrivateHostname(parsed.hostname)) {
    return { valid: false, error: 'Access to private/internal hosts is blocked' };
  }

  try {
    const records = await Deno.resolveDns(parsed.hostname, 'A');
    for (const ip of records) {
      const octets = parseIPv4(ip);
      if (octets && isPrivateIPv4(octets)) {
        return { valid: false, error: 'URL resolves to a private/internal IP address' };
      }
    }
  } catch {
    // DNS failure — let the fetch handle the error
  }

  try {
    const aaaaRecords = await Deno.resolveDns(parsed.hostname, 'AAAA');
    for (const ip of aaaaRecords) {
      if (isPrivateIPv6(ip)) {
        return { valid: false, error: 'URL resolves to a private/internal IPv6 address' };
      }
    }
  } catch {
    // DNS failure — let the fetch handle the error
  }

  return { valid: true };
}
