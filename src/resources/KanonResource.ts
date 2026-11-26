import { BaseResource } from './BaseResource';
import { digestHex } from '../crypto';
import type { EmailBreachTeaser, PwnedPasswordResult } from '../types';

/** Length of the SHA-1 prefix sent for a password range query. */
export const PWNED_PREFIX_LENGTH = 5;
/** Length of the SHA-256(email) prefix sent for the email teaser. */
export const EMAIL_HASH_LENGTH = 24;

/** Split a password's uppercase SHA-1 into the 5-char prefix that is sent and the 35-char suffix kept locally. */
export async function splitPwnedHash(password: string): Promise<{ prefix: string; suffix: string }> {
  const hash = (await digestHex('SHA-1', password)).toUpperCase();
  return { prefix: hash.slice(0, PWNED_PREFIX_LENGTH), suffix: hash.slice(PWNED_PREFIX_LENGTH) };
}

/** First 24 hex chars of SHA-256(trimmed, lowercased email) — what the email teaser expects. */
export async function emailKanonHash(email: string): Promise<string> {
  return (await digestHex('SHA-256', email.trim().toLowerCase())).slice(0, EMAIL_HASH_LENGTH);
}

/** Find a SHA-1 suffix in a range bucket. A malformed bucket answers "not found". */
export function matchPwnedRange(rows: unknown, suffix: string): { pwned: boolean; count: number } {
  if (!Array.isArray(rows)) return { pwned: false, count: 0 };
  const wanted = suffix.toUpperCase();
  for (const row of rows as Array<{ suffix?: unknown; count?: unknown } | null>) {
    if (!row || typeof row.suffix !== 'string' || row.suffix.toUpperCase() !== wanted) continue;
    const count = typeof row.count === 'number' && Number.isFinite(row.count) ? row.count : Number(row.count) || 0;
    return { pwned: count > 0, count };
  }
  return { pwned: false, count: 0 };
}

/**
 * Free, keyless breach checks that never send the secret itself (k-anonymity):
 * the hash is computed in this process and only a short prefix goes out.
 */
export class KanonResource extends BaseResource {
  /**
   * Has this password appeared in a breach? Only the first 5 hex chars of its
   * SHA-1 are sent (HIBP-style range query); the match happens locally.
   */
  async pwnedPassword(password: string): Promise<PwnedPasswordResult> {
    const { prefix, suffix } = await splitPwnedHash(password);
    const res = await this.http.request<{ results?: unknown }>({
      method: 'GET',
      path: `/public/pwned/range/${prefix}`,
      auth: 'none',
    });
    const { pwned, count } = matchPwnedRange(res && res.results, suffix);
    return { pwned, count, prefix };
  }

  /** Raw range bucket for a 5-char SHA-1 prefix: `{ prefix, count, results: [{ suffix, count }] }`. */
  passwordRange(prefix: string): Promise<{ prefix: string; count: number; results: Array<{ suffix: string; count: number }> }> {
    return this.http.request({ method: 'GET', path: `/public/pwned/range/${encodeURIComponent(prefix.toUpperCase())}`, auth: 'none' });
  }

  /**
   * Free breach teaser for an email: sources and exposed field names, no records.
   * Only the first 24 hex chars of SHA-256(lowercased email) are sent.
   */
  async emailBreach(email: string): Promise<EmailBreachTeaser> {
    const hash = await emailKanonHash(email);
    return this.http.request<EmailBreachTeaser>({ method: 'POST', path: '/public/breach/email', body: { hash }, auth: 'none' });
  }
}
