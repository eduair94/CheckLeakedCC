/**
 * Hashing helpers on the Web Crypto API (`globalThis.crypto.subtle`), which
 * Node 20+, Bun, Deno and edge runtimes all ship — so the SDK stays
 * dependency-free and does not need `node:crypto`.
 */

function subtle(): SubtleCrypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c || !c.subtle) {
    throw new Error('Web Crypto (globalThis.crypto.subtle) is unavailable. Use Node 20+.');
  }
  return c.subtle;
}

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

const encoder = new TextEncoder();

/** Lowercase hex digest of a UTF-8 string. */
export async function digestHex(algorithm: 'SHA-1' | 'SHA-256', input: string): Promise<string> {
  return toHex(await subtle().digest(algorithm, encoder.encode(input)));
}

/** Lowercase hex HMAC-SHA256 of `message` keyed with `secret`. */
export async function hmacSha256Hex(secret: string, message: string | Uint8Array): Promise<string> {
  const key = await subtle().importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  // Copy into a fresh ArrayBuffer-backed view (Web Crypto rejects SharedArrayBuffer views).
  const data = typeof message === 'string' ? encoder.encode(message) : new Uint8Array(message);
  return toHex(await subtle().sign('HMAC', key, data));
}

/** Constant-time comparison of two strings (length leak only). */
export function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
